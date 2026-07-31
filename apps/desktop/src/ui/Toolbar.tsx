import { useCallback, useState } from 'react';

import { screenCenterWorld } from '../canvas/viewport';
import * as api from '../ipc/commands';
import type { NodeKind } from '../ipc/types';
import { DEFAULT_NODE_SIZE, useWorkspaceStore } from '../stores/workspaceStore';
import { AgentDialog } from './AgentDialog';

/** Cria nos no centro da area visivel, com um deslocamento por no ja existente. */
const CASCATA_PX = 28;

interface ToolbarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onTogglePanel: () => void;
}

export function Toolbar({ theme, onToggleTheme, onTogglePanel }: ToolbarProps) {
  const { createNode, nodes, viewport, undo, redo, selectedIds, deleteSelected, connectMaestro } =
    useWorkspaceStore();
  const [mostrarAgente, setMostrarAgente] = useState(false);

  // Agentes selecionados, em ordem de seleção (Set preserva ordem de inserção).
  const agentesSelecionados = [...selectedIds].filter((id) => {
    const n = nodes.find((no) => no.id === id);
    return n?.kind.type === 'agent';
  });

  const montarMaestro = () => {
    const [orquestrador, ...workers] = agentesSelecionados;
    if (orquestrador && workers.length > 0) {
      void connectMaestro(orquestrador, workers);
    }
  };

  const posicaoParaNovoNo = useCallback(
    (largura: number, altura: number) => {
      const centro = screenCenterWorld(viewport, window.innerWidth, window.innerHeight);
      const deslocamento = (nodes.length % 8) * CASCATA_PX;
      return {
        x: centro.x - largura / 2 + deslocamento,
        y: centro.y - altura / 2 + deslocamento,
      };
    },
    [nodes.length, viewport],
  );

  const novoTerminal = useCallback(async () => {
    const shell = await api.ptyDefaultShell();
    await createNode({ type: 'terminal', cwd: '', shell }, posicaoParaNovoNo(640, 420));
  }, [createNode, posicaoParaNovoNo]);

  const novaNota = useCallback(async () => {
    const nome = `notas/nota-${Date.now()}.md`;
    await createNode({ type: 'markdown', filePath: nome, color: '' }, posicaoParaNovoNo(480, 400));
  }, [createNode, posicaoParaNovoNo]);

  const novoFrame = useCallback(async () => {
    await createNode({ type: 'frame', title: 'Novo grupo' }, posicaoParaNovoNo(900, 640));
  }, [createNode, posicaoParaNovoNo]);

  const novoGit = useCallback(async () => {
    const { width, height } = DEFAULT_NODE_SIZE.git;
    await createNode({ type: 'git' }, posicaoParaNovoNo(width, height));
  }, [createNode, posicaoParaNovoNo]);

  const novaArvore = useCallback(async () => {
    const { width, height } = DEFAULT_NODE_SIZE.fileTree;
    await createNode({ type: 'fileTree', root: '' }, posicaoParaNovoNo(width, height));
  }, [createNode, posicaoParaNovoNo]);

  const criarAgente = useCallback(
    (kind: Extract<NodeKind, { type: 'agent' }>) => {
      setMostrarAgente(false);
      void createNode(kind, posicaoParaNovoNo(680, 460));
    },
    [createNode, posicaoParaNovoNo],
  );

  return (
    <nav className="toolbar" aria-label="Ações do workspace">
      <span className="toolbar__brand">Orkai</span>

      <button type="button" onClick={() => void novoTerminal()}>
        + Terminal
      </button>
      <button type="button" onClick={() => void novaNota()}>
        + Nota
      </button>
      <button type="button" onClick={() => void novoFrame()}>
        + Grupo
      </button>
      <button type="button" onClick={() => void novoGit()}>
        + Git
      </button>
      <button type="button" onClick={() => void novaArvore()}>
        + Arquivos
      </button>
      <button type="button" className="toolbar__agente" onClick={() => setMostrarAgente(true)}>
        + Agente
      </button>

      <span className="toolbar__separador" />

      <button type="button" title="Desfazer (Ctrl+Z)" onClick={() => void undo()}>
        ↶
      </button>
      <button type="button" title="Refazer (Ctrl+Shift+Z)" onClick={() => void redo()}>
        ↷
      </button>
      <button
        type="button"
        title="Excluir seleção (Delete)"
        disabled={selectedIds.size === 0}
        onClick={() => void deleteSelected()}
      >
        Excluir
      </button>

      <button
        type="button"
        title="Modo Maestro: liga o 1º agente selecionado aos demais"
        disabled={agentesSelecionados.length < 2}
        onClick={montarMaestro}
      >
        Maestro
      </button>
      <button type="button" title="Painel de agentes" onClick={onTogglePanel}>
        Agentes
      </button>
      <button
        type="button"
        title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        aria-label="Alternar tema"
        onClick={onToggleTheme}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>

      <span className="toolbar__dica">
        Arraste o fundo para mover · Shift+arrastar seleciona · Alt desliga o ímã
      </span>

      {mostrarAgente && (
        <AgentDialog
          defaultCwd=""
          onCancel={() => setMostrarAgente(false)}
          onCreate={criarAgente}
        />
      )}
    </nav>
  );
}
