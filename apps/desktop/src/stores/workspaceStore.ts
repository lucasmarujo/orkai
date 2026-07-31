import { create } from 'zustand';

import * as api from '../ipc/commands';
import type { CanvasNode, Connection, NodeKind, Size, Vec2, Viewport } from '../ipc/types';
import { createDebouncer } from './debounce';

/**
 * Projecao do workspace que vive no Rust.
 *
 * Gestos (arrastar, redimensionar) sao otimistas aqui e persistidos uma vez no fim,
 * via `commitGesture` — isso mantem o undo com granularidade de gesto, nao de frame.
 * O viewport continua com debounce por ser mudanca de camera, nao de conteudo.
 */

const VIEWPORT_DELAY_MS = 300;
const persistencia = createDebouncer(VIEWPORT_DELAY_MS);

export const DEFAULT_NODE_SIZE: Record<NodeKind['type'], Size> = {
  terminal: { width: 640, height: 420 },
  markdown: { width: 480, height: 400 },
  frame: { width: 900, height: 640 },
  agent: { width: 680, height: 460 },
  git: { width: 760, height: 520 },
  fileTree: { width: 320, height: 480 },
};

interface WorkspaceState {
  nodes: CanvasNode[];
  connections: Connection[];
  viewport: Viewport;
  selectedIds: Set<string>;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  setViewport: (viewport: Viewport) => void;
  flush: () => Promise<void>;

  setSelection: (ids: Set<string>) => void;
  selectAll: () => void;

  createNode: (kind: NodeKind, position: Vec2) => Promise<void>;
  /** Atualiza nos localmente durante um gesto, sem tocar no backend. */
  previewNodes: (updates: Map<string, Partial<CanvasNode>>) => void;
  /** Fecha o gesto: persiste e vira um passo de undo. */
  commitGesture: (before: CanvasNode[]) => Promise<void>;
  deleteSelected: () => Promise<void>;
  setNoteColor: (id: string, color: string) => Promise<void>;

  connect: (from: string, to: string) => Promise<void>;
  connectMaestro: (orchestrator: string, workers: string[]) => Promise<void>;
  disconnect: (id: string) => Promise<void>;

  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  nodes: [],
  connections: [],
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  selectedIds: new Set(),
  loading: true,
  error: null,

  load: async () => {
    try {
      const workspace = await api.workspaceLoad();
      set({
        nodes: workspace.nodes,
        connections: workspace.connections,
        viewport: workspace.viewport,
        loading: false,
        error: null,
      });
    } catch (erro) {
      set({ loading: false, error: String(erro) });
    }
  },

  setViewport: (viewport) => {
    set({ viewport });
    persistencia.schedule('viewport', () => {
      void api.viewportSave(viewport).catch((erro) => set({ error: String(erro) }));
    });
  },

  // Chamado no fechamento da janela: sem isto o ultimo pan/zoom se perderia.
  flush: async () => {
    persistencia.cancel('viewport');
    try {
      await api.viewportSave(get().viewport);
    } catch (erro) {
      set({ error: String(erro) });
    }
  },

  setSelection: (selectedIds) => set({ selectedIds }),

  selectAll: () => set((estado) => ({ selectedIds: new Set(estado.nodes.map((n) => n.id)) })),

  createNode: async (kind, position) => {
    try {
      const node = await api.nodeCreate(kind, position, DEFAULT_NODE_SIZE[kind.type]);
      set((estado) => ({
        nodes: [...estado.nodes, node],
        selectedIds: new Set([node.id]),
        error: null,
      }));
    } catch (erro) {
      set({ error: String(erro) });
    }
  },

  previewNodes: (updates) => {
    set((estado) => ({
      nodes: estado.nodes.map((n) => {
        const patch = updates.get(n.id);
        return patch ? { ...n, ...patch } : n;
      }),
    }));
  },

  commitGesture: async (before) => {
    const atuais = get().nodes;
    const after = before
      .map((anterior) => atuais.find((n) => n.id === anterior.id))
      .filter((n): n is CanvasNode => n !== undefined);

    const mudou = after.some((depois, i) => {
      const antes = before[i];
      return (
        antes !== undefined &&
        (antes.position.x !== depois.position.x ||
          antes.position.y !== depois.position.y ||
          antes.size.width !== depois.size.width ||
          antes.size.height !== depois.size.height)
      );
    });
    // Clique sem arrasto nao deve virar passo de undo.
    if (!mudou || after.length === 0) return;

    try {
      await api.nodesUpdate(before.slice(0, after.length), after);
      set({ error: null });
    } catch (erro) {
      set({ nodes: reconciliar(get().nodes, before), error: String(erro) });
    }
  },

  deleteSelected: async () => {
    const alvos = [...get().selectedIds];
    if (alvos.length === 0) return;

    const anteriores = { nodes: get().nodes, connections: get().connections };
    set((estado) => ({
      nodes: estado.nodes.filter((n) => !estado.selectedIds.has(n.id)),
      connections: estado.connections.filter(
        (c) => !estado.selectedIds.has(c.from) && !estado.selectedIds.has(c.to),
      ),
      selectedIds: new Set(),
    }));

    try {
      for (const id of alvos) {
        await api.nodeDelete(id);
      }
    } catch (erro) {
      set({ ...anteriores, error: String(erro) });
    }
  },

  setNoteColor: async (id, color) => {
    try {
      const atualizado = await api.nodeSetColor(id, color);
      set((estado) => ({
        nodes: estado.nodes.map((n) => (n.id === id ? atualizado : n)),
        error: null,
      }));
    } catch (erro) {
      set({ error: String(erro) });
    }
  },

  connect: async (from, to) => {
    try {
      const connection = await api.connectionCreate(from, to);
      // `null` = recusada pelo dominio (laço ou duplicata). Nao e erro, e no-op.
      if (connection) {
        set((estado) => ({ connections: [...estado.connections, connection], error: null }));
      }
    } catch (erro) {
      set({ error: String(erro) });
    }
  },

  connectMaestro: async (orchestrator, workers) => {
    try {
      const criadas = await api.connectMaestro(orchestrator, workers);
      if (criadas.length > 0) {
        set((estado) => ({ connections: [...estado.connections, ...criadas], error: null }));
      }
    } catch (erro) {
      set({ error: String(erro) });
    }
  },

  disconnect: async (id) => {
    const anteriores = get().connections;
    set((estado) => ({ connections: estado.connections.filter((c) => c.id !== id) }));
    try {
      await api.connectionDelete(id);
    } catch (erro) {
      set({ connections: anteriores, error: String(erro) });
    }
  },

  undo: async () => {
    await aplicarHistorico(set, api.historyUndo);
  },

  redo: async () => {
    await aplicarHistorico(set, api.historyRedo);
  },
}));

/** O backend devolve o workspace inteiro; o front so troca a projecao. */
async function aplicarHistorico(
  set: (parcial: Partial<WorkspaceState>) => void,
  acao: () => Promise<{ nodes: CanvasNode[]; connections: Connection[] }>,
) {
  try {
    const workspace = await acao();
    set({
      nodes: workspace.nodes,
      connections: workspace.connections,
      selectedIds: new Set(),
      error: null,
    });
  } catch (erro) {
    set({ error: String(erro) });
  }
}

function reconciliar(atuais: CanvasNode[], restaurar: CanvasNode[]): CanvasNode[] {
  return atuais.map((n) => restaurar.find((r) => r.id === n.id) ?? n);
}
