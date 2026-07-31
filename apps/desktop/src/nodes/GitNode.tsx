import { useCallback, useEffect, useMemo, useState } from 'react';

import * as api from '../ipc/commands';
import type { GitNodeStatus } from '../ipc/commands';
import type { CanvasNode } from '../ipc/types';
import { parseDiff } from './diff';

/** Status é polling, como no `AgentPanel`: o git muda por fora do app. */
const RECARGA_MS = 4000;

/** Rótulo de cada código do `git status --porcelain`. */
const ROTULO_STATUS: Record<string, string> = {
  M: 'modificado',
  A: 'adicionado',
  D: 'apagado',
  R: 'renomeado',
  '?': 'novo',
};

/**
 * Status e diff de um repositório git, no canvas.
 *
 * De qual pasta ele fala é decidido pela conexão: ligado a um agente isolado mostra o
 * worktree daquele agente e habilita integrar/descartar; solto, mostra a raiz do
 * workflow. O backend resolve isso pelos peers — o nó não guarda pasta nenhuma.
 */
export function GitNode({ node }: { node: CanvasNode }) {
  const [status, setStatus] = useState<GitNodeStatus | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [diff, setDiff] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const novo = await api.gitNodeStatus(node.id);
      setStatus(novo);
      setErro(null);
    } catch (e) {
      // Pasta que não é repositório é o caso comum, não uma falha: o nó mostra o
      // aviso e continua tentando, porque `git init` pode acontecer a qualquer hora.
      setErro(String(e));
      setStatus(null);
    }
  }, [node.id]);

  useEffect(() => {
    void recarregar();
    const timer = setInterval(() => void recarregar(), RECARGA_MS);
    return () => clearInterval(timer);
  }, [recarregar]);

  useEffect(() => {
    if (!selecionado) {
      setDiff('');
      return;
    }
    let vivo = true;
    api
      .gitNodeDiff(node.id, selecionado)
      .then((texto) => vivo && setDiff(texto))
      .catch((e) => vivo && setDiff(String(e)));
    return () => {
      vivo = false;
    };
    // `status` na dependência: depois de integrar/descartar o diff exibido mudou.
  }, [node.id, selecionado, status]);

  const linhas = useMemo(() => parseDiff(diff), [diff]);

  const agir = async (acao: 'merge' | 'discard') => {
    if (!status?.ownerId) return;
    setOcupado(true);
    try {
      if (acao === 'merge') await api.gitWorktreeMerge(status.ownerId);
      else await api.gitWorktreeDiscard(status.ownerId);
      setSelecionado(null);
      setErro(null);
    } catch (e) {
      setErro(String(e));
    } finally {
      setOcupado(false);
      await recarregar();
    }
  };

  if (erro && !status) {
    return (
      <div className="git-node git-node--vazio">
        <p className="git-node__aviso" role="alert">
          {erro}
        </p>
      </div>
    );
  }

  return (
    <div className="git-node" onPointerDown={(e) => e.stopPropagation()}>
      <header className="git-node__topo">
        <span className="git-node__branch">{status?.branch ?? '…'}</span>
        {status?.dirty && <span className="git-node__sujo">não commitado</span>}
        {status?.isWorktree && status.ownerId && (
          <span className="git-node__acoes">
            <button type="button" disabled={ocupado} onClick={() => void agir('merge')}>
              Integrar
            </button>
            <button type="button" disabled={ocupado} onClick={() => void agir('discard')}>
              Descartar
            </button>
          </span>
        )}
      </header>

      {erro && (
        <p className="git-node__aviso" role="alert">
          {erro}
        </p>
      )}

      <div className="git-node__corpo">
        <ul className="git-node__arquivos">
          {status?.files.length === 0 && <li className="git-node__limpo">Nada mexido.</li>}
          {status?.files.map((arquivo) => (
            <li key={arquivo.path}>
              <button
                type="button"
                className={arquivo.path === selecionado ? 'is-active' : undefined}
                onClick={() => setSelecionado(arquivo.path)}
              >
                <span
                  className={`git-node__status git-node__status--${arquivo.status === '?' ? 'novo' : arquivo.status.toLowerCase()}`}
                  title={ROTULO_STATUS[arquivo.status] ?? arquivo.status}
                >
                  {arquivo.status}
                </span>
                <span className="git-node__caminho">{arquivo.path}</span>
                <span className="git-node__contagem">
                  +{arquivo.added} −{arquivo.removed}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <pre className="git-node__diff">
          {selecionado === null ? (
            <span className="git-node__dica">Escolha um arquivo para ver o diff.</span>
          ) : (
            linhas.map((linha, i) => (
              // Texto, nunca `innerHTML`: conteúdo de arquivo não tem como virar markup.
              <span key={i} className={`diff__linha diff__linha--${linha.tipo}`}>
                {linha.texto || ' '}
              </span>
            ))
          )}
        </pre>
      </div>
    </div>
  );
}
