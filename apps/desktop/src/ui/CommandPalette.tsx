import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as api from '../ipc/commands';
import type { SearchHit } from '../ipc/commands';
import { nodeRegistry } from '../nodes/registry';
import { createDebouncer } from '../stores/debounce';
import { usePrompts } from '../stores/promptsStore';
import { DEFAULT_NODE_SIZE, useWorkspaceStore } from '../stores/workspaceStore';
import { useWorkflowStore } from '../stores/workflowStore';
import { filtrar, type Resultado } from './palette';

/** Espera o usuário parar de digitar antes de ir ao backend. */
const BUSCA_DELAY_MS = 150;
const busca = createDebouncer(BUSCA_DELAY_MS);

interface CommandPaletteProps {
  onClose: () => void;
  onToggleTheme: () => void;
}

/**
 * Busca e ações por teclado (`Ctrl+K`).
 *
 * Nós, ações e prompts são filtrados aqui mesmo — já estão em memória, e indexá-los
 * seria manter um índice para o que um `Array.filter` resolve. Só conteúdo de arquivo
 * vai ao FTS5 no backend, que já devolve ranqueado por BM25.
 */
export function CommandPalette({ onClose, onToggleTheme }: CommandPaletteProps) {
  const [termo, setTermo] = useState('');
  const [arquivos, setArquivos] = useState<SearchHit[]>([]);
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const nodes = useWorkspaceStore((s) => s.nodes);
  const selectedIds = useWorkspaceStore((s) => s.selectedIds);
  const prompts = usePrompts((s) => s.prompts);
  const carregarPrompts = usePrompts((s) => s.load);
  const workflows = useWorkflowStore((s) => s.workflows);

  useEffect(() => {
    inputRef.current?.focus();
    void carregarPrompts();
    // O índice é reconstruído na abertura em vez de por watcher: o corpus é a pasta
    // de um workflow, e um estado a menos para divergir do disco.
    void api.searchReindex();
  }, [carregarPrompts]);

  useEffect(() => {
    const alvo = termo.trim();
    if (!alvo) {
      setArquivos([]);
      return;
    }
    busca.schedule('arquivos', () => {
      void api
        .searchQuery(alvo)
        .then(setArquivos)
        .catch(() => setArquivos([]));
    });
  }, [termo]);

  /** Centraliza o viewport num nó e o seleciona. */
  const irParaNo = useCallback((id: string) => {
    const store = useWorkspaceStore.getState();
    const node = store.nodes.find((n) => n.id === id);
    if (!node) return;
    store.setSelection(new Set([id]));
    const { zoom } = store.viewport;
    store.setViewport({
      zoom,
      pan: {
        x: node.position.x + node.size.width / 2 - window.innerWidth / (2 * zoom),
        y: node.position.y + node.size.height / 2 - window.innerHeight / (2 * zoom),
      },
    });
  }, []);

  /** Nota já aberta nesse arquivo é focada; senão cria uma no centro da tela. */
  const abrirArquivo = useCallback(
    async (path: string) => {
      const store = useWorkspaceStore.getState();
      const existente = store.nodes.find(
        (n) => n.kind.type === 'markdown' && n.kind.filePath === path,
      );
      if (existente) {
        irParaNo(existente.id);
        return;
      }
      await store.createNode(
        { type: 'markdown', filePath: path, color: '' },
        centroDaTela(DEFAULT_NODE_SIZE.markdown),
      );
    },
    [irParaNo],
  );

  /** Primeiro agente selecionado — destino de um prompt disparado daqui. */
  const agenteAlvo = useMemo(
    () =>
      [...selectedIds]
        .map((id) => nodes.find((n) => n.id === id))
        .find((n) => n?.kind.type === 'agent'),
    [nodes, selectedIds],
  );

  const locais = useMemo<Resultado[]>(() => {
    const store = useWorkspaceStore.getState();

    const acoes: Resultado[] = [
      { titulo: 'Novo terminal', executar: async () => criarTerminal() },
      {
        titulo: 'Nova nota',
        executar: () =>
          store.createNode(
            { type: 'markdown', filePath: `notas/nota-${Date.now()}.md`, color: '' },
            centroDaTela(DEFAULT_NODE_SIZE.markdown),
          ),
      },
      {
        titulo: 'Novo grupo',
        executar: () =>
          store.createNode({ type: 'frame', title: 'Novo grupo' }, centroDaTela(DEFAULT_NODE_SIZE.frame)),
      },
      {
        titulo: 'Novo nó de git',
        executar: () => store.createNode({ type: 'git' }, centroDaTela(DEFAULT_NODE_SIZE.git)),
      },
      {
        titulo: 'Nova árvore de arquivos',
        executar: () =>
          store.createNode({ type: 'fileTree', root: '' }, centroDaTela(DEFAULT_NODE_SIZE.fileTree)),
      },
      { titulo: 'Alternar tema', executar: onToggleTheme },
      { titulo: 'Desfazer', executar: () => store.undo() },
      { titulo: 'Refazer', executar: () => store.redo() },
    ].map((acao, i) => ({
      tipo: 'acao' as const,
      id: `acao-${i}`,
      detalhe: '',
      ...acao,
    }));

    const trocaDeWorkflow: Resultado[] = workflows.map((w) => ({
      tipo: 'acao',
      id: `workflow-${w.id}`,
      titulo: `Ativar workflow: ${w.name}`,
      detalhe: w.rootPath,
      executar: () => useWorkflowStore.getState().activate(w.id),
    }));

    const nos: Resultado[] = nodes.map((node) => ({
      tipo: 'no',
      id: node.id,
      // Reusa o título do registry: um nó novo aparece na busca sem tocar aqui.
      titulo: nodeRegistry[node.kind.type].title(node),
      detalhe: node.kind.type,
      executar: () => irParaNo(node.id),
    }));

    const daBiblioteca: Resultado[] = prompts.map((prompt) => ({
      tipo: 'prompt',
      id: prompt.id,
      titulo: prompt.nome,
      detalhe: agenteAlvo ? `enviar para ${nodeRegistry.agent.title(agenteAlvo)}` : 'sem agente selecionado',
      executar: async () => {
        if (agenteAlvo) await api.ptyWrite(agenteAlvo.id, prompt.texto);
      },
    }));

    return [...acoes, ...trocaDeWorkflow, ...nos, ...daBiblioteca];
  }, [agenteAlvo, irParaNo, nodes, onToggleTheme, prompts, workflows]);

  const resultados = useMemo<Resultado[]>(() => {
    const daBusca: Resultado[] = arquivos.map((hit) => ({
      tipo: 'arquivo',
      id: `arquivo-${hit.path}`,
      titulo: hit.path,
      detalhe: hit.snippet,
      executar: () => abrirArquivo(hit.path),
    }));
    // O FTS5 já ordenou por BM25; `filtrar` não pode reordenar isso.
    return [...filtrar(locais, termo), ...daBusca];
  }, [abrirArquivo, arquivos, locais, termo]);

  useEffect(() => setAtivo(0), [termo, arquivos]);

  const executar = async (resultado: Resultado | undefined) => {
    if (!resultado) return;
    onClose();
    await resultado.executar();
  };

  const aoTeclar = (evento: React.KeyboardEvent) => {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      onClose();
      return;
    }
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault();
      const passo = evento.key === 'ArrowDown' ? 1 : -1;
      setAtivo((i) => {
        if (resultados.length === 0) return 0;
        return (i + passo + resultados.length) % resultados.length;
      });
      return;
    }
    if (evento.key === 'Enter') {
      evento.preventDefault();
      void executar(resultados[ativo]);
    }
  };

  return (
    <div className="palette-backdrop" onPointerDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar e executar"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={aoTeclar}
      >
        <input
          ref={inputRef}
          type="text"
          className="palette__input"
          placeholder="Buscar nós, arquivos, ações e prompts…"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          aria-label="Termo de busca"
        />
        <ul className="palette__lista" role="listbox">
          {resultados.length === 0 && <li className="palette__vazio">Nada encontrado.</li>}
          {resultados.map((resultado, i) => (
            <li key={resultado.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === ativo}
                className={`palette__item ${i === ativo ? 'is-active' : ''}`}
                disabled={resultado.tipo === 'prompt' && !agenteAlvo}
                onMouseEnter={() => setAtivo(i)}
                onClick={() => void executar(resultado)}
              >
                <span className={`palette__tipo palette__tipo--${resultado.tipo}`}>
                  {resultado.tipo}
                </span>
                <span className="palette__titulo">{resultado.titulo}</span>
                {resultado.detalhe && (
                  <span className="palette__detalhe">{resultado.detalhe}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Canto superior esquerdo para um nó desse tamanho cair no centro da área visível. */
function centroDaTela({ width, height }: { width: number; height: number }) {
  const { pan, zoom } = useWorkspaceStore.getState().viewport;
  return {
    x: pan.x + window.innerWidth / (2 * zoom) - width / 2,
    y: pan.y + window.innerHeight / (2 * zoom) - height / 2,
  };
}

async function criarTerminal() {
  const shell = await api.ptyDefaultShell();
  await useWorkspaceStore
    .getState()
    .createNode({ type: 'terminal', cwd: '', shell }, centroDaTela(DEFAULT_NODE_SIZE.terminal));
}
