import { ask } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from 'react';

import { porUrgencia, rotuloAtencao } from '../agents/attention';
import { screenCenterWorld } from '../canvas/viewport';
import * as api from '../ipc/commands';
import type { AgentWorktree, McpCall } from '../ipc/commands';
import type { CanvasNode, NodeKind } from '../ipc/types';
import { useAgentActivity } from '../stores/agentActivityStore';
import { DEFAULT_NODE_SIZE, useWorkspaceStore } from '../stores/workspaceStore';
import { AgentDialog } from './AgentDialog';
import { PromptLibrary } from './PromptLibrary';
import { RoleManager } from './RoleManager';
import { useResizable } from './useResizable';

/** Formata milissegundos de sessão como `1h 03m` / `12m` / `45s`. */
function duracao(desde: number, agora: number): string {
  const s = Math.max(0, Math.floor((agora - desde) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

const POLL_MS = 2000;

/**
 * Cadência do status de git. Mais lenta que o resto de propósito: cada volta dispara um
 * punhado de processos `git`, e diff de worktree não muda de segundo em segundo.
 */
const GIT_POLL_MS = 6000;

/**
 * Painel de agentes: status/turnos, caixa de entrada e o log de chamadas MCP — o
 * debugger visual ("veja cada tool call"). Faz polling do backend a cada 2s.
 */
export function AgentPanel({ nodes, onClose }: { nodes: CanvasNode[]; onClose: () => void }) {
  const byId = useAgentActivity((s) => s.byId);
  const pending = useAgentActivity((s) => s.pending);
  const setPending = useAgentActivity((s) => s.setPending);
  const createNode = useWorkspaceStore((s) => s.createNode);
  const viewport = useWorkspaceStore((s) => s.viewport);
  const [agora, setAgora] = useState(Date.now());
  const [chamadas, setChamadas] = useState<McpCall[]>([]);
  const [aba, setAba] = useState<'agentes' | 'roles' | 'prompts'>('agentes');
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const atencao = useAgentActivity((s) => s.attention);
  const [worktrees, setWorktrees] = useState<Record<string, AgentWorktree>>({});
  const [avisoGit, setAvisoGit] = useState<string | null>(null);
  const { width, onResizeStart } = useResizable('orkai.agentPanel.width', 280, 'right');

  const criarAgente = (kind: Extract<NodeKind, { type: 'agent' }>) => {
    setMostrarDialog(false);
    const size = DEFAULT_NODE_SIZE.agent;
    const centro = screenCenterWorld(viewport, window.innerWidth, window.innerHeight);
    void createNode(kind, { x: centro.x - size.width / 2, y: centro.y - size.height / 2 });
  };

  useEffect(() => {
    let vivo = true;
    const nomePorId = new Map(
      nodes.filter((n) => n.kind.type === 'agent').map((n) => [n.id, true]),
    );

    const tick = async () => {
      setAgora(Date.now());
      try {
        const [inboxes, atividade] = await Promise.all([api.agentInboxes(), api.mcpActivity()]);
        if (!vivo) return;
        setPending(Object.fromEntries(inboxes.map((i) => [i.nodeId, i.pending])));
        // Só chamadas de agentes que ainda existem no canvas.
        setChamadas(atividade.filter((c) => nomePorId.has(c.nodeId)).slice(-30).reverse());
      } catch {
        // Backend ocupado num tick não é erro fatal do painel.
      }
    };

    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [nodes, setPending]);

  // Worktrees em cadência própria. Só enquanto o painel está aberto: é a única tela
  // que mostra esse status, e cada volta custa processos `git`.
  useEffect(() => {
    let vivo = true;
    const tick = async () => {
      try {
        const lista = await api.gitAgentsStatus();
        if (vivo) setWorktrees(Object.fromEntries(lista.map((w) => [w.nodeId, w])));
      } catch {
        // Pasta sem git ou repositório em rebase: nada a mostrar nesta volta.
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), GIT_POLL_MS);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, []);

  const integrar = async (id: string) => {
    setAvisoGit(null);
    try {
      const saida = await api.gitWorktreeMerge(id);
      setAvisoGit(saida.split('\n')[0] || 'Branch integrada.');
    } catch (e) {
      setAvisoGit(String(e));
    }
  };

  const descartar = async (id: string, nome: string) => {
    const confirmado = await ask(
      `Apagar a branch e a pasta de trabalho de ${nome}? O que não foi integrado se perde.`,
      { title: 'Descartar trabalho', kind: 'warning' },
    );
    if (!confirmado) return;

    setAvisoGit(null);
    try {
      await api.gitWorktreeDiscard(id);
      // ponytail: o nó do agente continua no canvas e volta a apontar para a pasta do
      // workflow no próximo spawn (o backend já cai para a raiz quando o cwd sumiu).
      // Apagar o nó junto seria decidir pelo usuário que a conversa também morreu.
      setWorktrees((atual) => {
        const resto = { ...atual };
        delete resto[id];
        return resto;
      });
      setAvisoGit(`Trabalho de ${nome} descartado.`);
    } catch (e) {
      setAvisoGit(String(e));
    }
  };

  const agentes = nodes
    .filter((n) => n.kind.type === 'agent')
    .sort((a, b) => porUrgencia(atencao[a.id], atencao[b.id]));
  const nomeDe = (id: string) => {
    const n = agentes.find((a) => a.id === id);
    return n && n.kind.type === 'agent' ? n.kind.name : id.slice(0, 8);
  };

  return (
    <aside className="agent-panel" style={{ flexBasis: width }} aria-label="Agentes">
      <div
        className="resizer resizer--left"
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar largura do painel de agentes"
        onPointerDown={onResizeStart}
      />

      <header className="agent-panel__head">
        <span>Agentes</span>
        <button type="button" aria-label="Fechar painel" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="agent-panel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={aba === 'agentes' ? 'is-active' : ''}
          onClick={() => setAba('agentes')}
        >
          Agentes
        </button>
        <button
          type="button"
          role="tab"
          className={aba === 'roles' ? 'is-active' : ''}
          onClick={() => setAba('roles')}
        >
          Roles
        </button>
        <button
          type="button"
          role="tab"
          className={aba === 'prompts' ? 'is-active' : ''}
          onClick={() => setAba('prompts')}
        >
          Prompts
        </button>
      </div>

      {aba === 'roles' ? (
        <RoleManager />
      ) : aba === 'prompts' ? (
        <PromptLibrary />
      ) : (
        <>
          <button
            type="button"
            className="agent-panel__novo"
            onClick={() => setMostrarDialog(true)}
          >
            + Novo agente
          </button>

          {agentes.length === 0 ? (
            <p className="agent-panel__vazio">Nenhum agente no workspace.</p>
          ) : (
            <ul className="agent-panel__lista">
              {agentes.map((node) => {
                const nome = node.kind.type === 'agent' ? node.kind.name : 'Agente';
                const atividade = byId[node.id];
                const estado = atencao[node.id];
                const pendentes = pending[node.id] ?? 0;
                const worktree = worktrees[node.id];
                return (
                  <li key={node.id} className={`agent-panel__item is-${estado ?? 'none'}`}>
                    <span className={`agent-panel__dot is-${estado ?? 'none'}`} />
                    <span className="agent-panel__nome">
                      {nome}
                      {pendentes > 0 && <span className="agent-panel__inbox">{pendentes}</span>}
                    </span>
                    <span className="agent-panel__meta">
                      {rotuloAtencao(estado)}
                      {atividade &&
                        ` · ${atividade.turns} turno(s) · ${duracao(atividade.startedAt, agora)}`}
                    </span>

                    {worktree && (
                      <div className="agent-panel__wt">
                        <code title={worktree.branch}>{worktree.branch}</code>
                        <span
                          className="agent-panel__diff"
                          title={
                            worktree.dirty
                              ? 'Há mudança não commitada: integrar só leva o que está commitado'
                              : 'Tudo commitado'
                          }
                        >
                          +{worktree.added}/−{worktree.removed}
                          {worktree.dirty && ' •'}
                        </span>
                        <button type="button" onClick={() => void integrar(node.id)}>
                          Integrar
                        </button>
                        <button type="button" onClick={() => void descartar(node.id, nome)}>
                          Descartar
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {avisoGit && (
            <p className="agent-panel__aviso" role="status">
              {avisoGit}
            </p>
          )}

          <div className="agent-panel__debug">
            <span className="agent-panel__debug-titulo">Chamadas MCP recentes</span>
            {chamadas.length === 0 ? (
              <p className="agent-panel__vazio">
                Nenhuma ainda. Peça a um agente para usar orkai_send.
              </p>
            ) : (
              <ul className="agent-panel__log">
                {chamadas.map((c, i) => (
                  <li key={`${c.at}-${i}`} className={c.ok ? 'is-ok' : 'is-err'}>
                    <code>{c.tool}</code>
                    <span>{nomeDe(c.nodeId)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {mostrarDialog && (
        <AgentDialog
          defaultCwd=""
          onCancel={() => setMostrarDialog(false)}
          onCreate={criarAgente}
        />
      )}
    </aside>
  );
}
