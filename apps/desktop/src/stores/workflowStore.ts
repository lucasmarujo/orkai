import { create } from 'zustand';

import * as api from '../ipc/commands';
import type { WorkflowSummary } from '../ipc/commands';
import type { Workspace } from '../ipc/types';
import { useWorkspaceStore } from './workspaceStore';

/**
 * Lista de workflows e qual está ativo.
 *
 * Trocar de workflow ou criar um novo recarrega o canvas: o backend é a fonte da verdade
 * e devolve o workspace inteiro, então o store do canvas só reprojeta.
 */
interface WorkflowState {
  workflows: WorkflowSummary[];
  activeId: string | null;
  loading: boolean;

  load: () => Promise<void>;
  activate: (id: string) => Promise<void>;
  create: (name: string, rootPath: string) => Promise<void>;
}

/** Reprojeta o workspace recém-carregado no store do canvas. */
function aplicarNoCanvas(workspace: Workspace) {
  useWorkspaceStore.setState({
    nodes: workspace.nodes,
    connections: workspace.connections,
    viewport: workspace.viewport,
    selectedIds: new Set(),
    error: null,
    loading: false,
  });
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  workflows: [],
  activeId: null,
  loading: true,

  load: async () => {
    const [workflows, activeId] = await Promise.all([api.workflowList(), api.workflowActive()]);
    set({ workflows, activeId, loading: false });
  },

  activate: async (id) => {
    const workspace = await api.workflowActivate(id);
    aplicarNoCanvas(workspace);
    set({ activeId: id });
  },

  create: async (name, rootPath) => {
    const workspace = await api.workflowCreate(name, rootPath);
    aplicarNoCanvas(workspace);
    const [workflows, activeId] = await Promise.all([api.workflowList(), api.workflowActive()]);
    set({ workflows, activeId });
  },
}));
