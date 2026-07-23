import { invoke } from '@tauri-apps/api/core';

import type { CanvasNode, Connection, NodeKind, Size, Vec2, Viewport, Workspace } from './types';

/** Wrappers tipados dos comandos Tauri. Nenhum `invoke` solto no resto do app. */

export const workspaceLoad = (): Promise<Workspace> => invoke('workspace_load');

export const nodeCreate = (kind: NodeKind, position: Vec2, size: Size): Promise<CanvasNode> =>
  invoke('node_create', { kind, position, size });

/** Persiste um gesto inteiro e registra um passo unico de undo. */
export const nodesUpdate = (before: CanvasNode[], after: CanvasNode[]): Promise<void> =>
  invoke('nodes_update', { before, after });

export const nodeDelete = (id: string): Promise<void> => invoke('node_delete', { id });

export const nodeSetColor = (id: string, color: string): Promise<CanvasNode> =>
  invoke('node_set_color', { id, color });

// ---------------------------------------------------------------- workflows

export interface WorkflowSummary {
  id: string;
  name: string;
  rootPath: string;
}

export const workflowList = (): Promise<WorkflowSummary[]> => invoke('workflow_list');

export const workflowActive = (): Promise<string> => invoke('workflow_active');

export const workflowCreate = (name: string, rootPath: string): Promise<Workspace> =>
  invoke('workflow_create', { name, rootPath });

export const workflowActivate = (id: string): Promise<Workspace> =>
  invoke('workflow_activate', { id });

/** Roles customizadas, serializadas como JSON (o backend só guarda o blob). */
export const rolesLoad = (): Promise<string> => invoke('roles_load');
export const rolesSave = (json: string): Promise<void> => invoke('roles_save', { json });

/** Devolve `null` quando a aresta e recusada (laço, duplicata, nó inexistente). */
export const connectionCreate = (from: string, to: string): Promise<Connection | null> =>
  invoke('connection_create', { from, to });

export const connectionDelete = (id: string): Promise<void> => invoke('connection_delete', { id });

export const historyUndo = (): Promise<Workspace> => invoke('history_undo');

export const historyRedo = (): Promise<Workspace> => invoke('history_redo');

// ---------------------------------------------------------------- colaboração (M4)

export interface InboxCount {
  nodeId: string;
  pending: number;
}

export interface McpCall {
  nodeId: string;
  tool: string;
  ok: boolean;
  at: number;
}

/** Mensagens pendentes por agente, para o badge de inbox no canvas. */
export const agentInboxes = (): Promise<InboxCount[]> => invoke('agent_inboxes');

/** Chamadas MCP recentes — alimenta o debugger visual de agente. */
export const mcpActivity = (): Promise<McpCall[]> => invoke('mcp_activity');

/** Liga um orquestrador a vários workers de uma vez. Devolve as arestas criadas. */
export const connectMaestro = (orchestrator: string, workers: string[]): Promise<Connection[]> =>
  invoke('connect_maestro', { orchestrator, workers });

export const viewportSave = (viewport: Viewport): Promise<void> =>
  invoke('viewport_save', { viewport });

export const fileRead = (path: string): Promise<string> => invoke('file_read', { path });

export const fileWrite = (path: string, content: string): Promise<void> =>
  invoke('file_write', { path, content });

export const ptySpawn = (nodeId: string, cols: number, rows: number): Promise<void> =>
  invoke('pty_spawn', { nodeId, cols, rows });

export const ptyWrite = (nodeId: string, data: string): Promise<void> =>
  invoke('pty_write', { nodeId, data });

export const ptyResize = (nodeId: string, cols: number, rows: number): Promise<void> =>
  invoke('pty_resize', { nodeId, cols, rows });

/** Historico da sessao em base64. */
export const ptyScrollback = (nodeId: string): Promise<string> =>
  invoke('pty_scrollback', { nodeId });

export const ptyKill = (nodeId: string): Promise<void> => invoke('pty_kill', { nodeId });

export const ptyDefaultShell = (): Promise<string> => invoke('pty_default_shell');
