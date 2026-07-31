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

/** Biblioteca de prompts, mesmo contrato de blob opaco das roles. */
export const promptsLoad = (): Promise<string> => invoke('prompts_load');
export const promptsSave = (json: string): Promise<void> => invoke('prompts_save', { json });

// ---------------------------------------------------------------- busca (M6)

export interface SearchHit {
  /** Caminho relativo à raiz do workflow. */
  path: string;
  /** Trecho recortado pelo FTS5, com o termo entre `[` e `]`. */
  snippet: string;
}

/** Reconstrói o índice do workflow ativo. Devolve quantos arquivos entraram. */
export const searchReindex = (): Promise<number> => invoke('search_reindex');

export const searchQuery = (query: string): Promise<SearchHit[]> =>
  invoke('search_query', { query });

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

// ---------------------------------------------------------------- atenção

/** Espelho de `AgentStatus` (Rust, `attention.rs`). */
export type AttentionStatus = 'running' | 'waiting' | 'idle' | 'exited';

export interface AgentAttention {
  nodeId: string;
  status: AttentionStatus;
  /** Instante da última saída, em ms desde a epoch. */
  since: number;
}

/** Quem está produzindo e quem parou numa pergunta. Alimenta o anel do nó. */
export const agentAttention = (): Promise<AgentAttention[]> => invoke('agent_attention');

// ---------------------------------------------------------------- git

/** Espelho de `WorktreeStatus` (Rust, `git.rs`), achatado com o nó dono. */
export interface AgentWorktree {
  nodeId: string;
  branch: string;
  added: number;
  removed: number;
  /** Há mudança não commitada — `gitWorktreeMerge` só leva o que está commitado. */
  dirty: boolean;
}

/** A pasta do workflow ativo é um repositório git? Decide se o isolamento é oferecido. */
export const gitWorkflowIsRepo = (): Promise<boolean> => invoke('git_workflow_is_repo');

/** Cria o worktree do agente e devolve a pasta, para virar o `cwd` dele. */
export const gitWorktreeCreate = (name: string): Promise<string> =>
  invoke('git_worktree_create', { name });

export const gitAgentsStatus = (): Promise<AgentWorktree[]> => invoke('git_agents_status');

/** Integra a branch do agente no repositório principal. Devolve a saída do `git merge`. */
export const gitWorktreeMerge = (nodeId: string): Promise<string> =>
  invoke('git_worktree_merge', { nodeId });

/** Descarta o trabalho do agente: mata o processo e apaga worktree e branch. */
export const gitWorktreeDiscard = (nodeId: string): Promise<void> =>
  invoke('git_worktree_discard', { nodeId });

/** Um arquivo mexido, como o `GitNode` lista. */
export interface GitFile {
  path: string;
  /** Código do `git status --porcelain`: `M`, `A`, `D`, `R` ou `?` (não rastreado). */
  status: string;
  added: number;
  removed: number;
}

export interface GitNodeStatus {
  /** Agente dono do worktree, ou `null` quando o nó olha a raiz do workflow. */
  ownerId: string | null;
  branch: string;
  dirty: boolean;
  /** Só num worktree do Orkai integrar/descartar fazem sentido. */
  isWorktree: boolean;
  files: GitFile[];
}

/** Status do repositório que o `GitNode` observa — a conexão decide qual é. */
export const gitNodeStatus = (nodeId: string): Promise<GitNodeStatus> =>
  invoke('git_node_status', { nodeId });

export const gitNodeDiff = (nodeId: string, path: string): Promise<string> =>
  invoke('git_node_diff', { nodeId, path });

// ---------------------------------------------------------------- árvore de arquivos

export interface DirEntry {
  name: string;
  /** Caminho relativo à raiz do workflow, sempre com `/`. */
  path: string;
  isDir: boolean;
}

/** Conteúdo de uma pasta do workflow, um nível só (a árvore carrega o que expande). */
export const dirList = (path: string): Promise<DirEntry[]> => invoke('dir_list', { path });

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

/** Se o binário do agente existe no PATH, pela mesma resolução que o spawn usa. */
export const commandAvailable = (command: string): Promise<boolean> =>
  invoke('command_available', { command });
