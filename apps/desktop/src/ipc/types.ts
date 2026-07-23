// Espelho dos tipos de `crates/orkai-core`.
//
// ponytail: escrito a mao enquanto sao poucos tipos. O teste
// `kind_serializa_com_tag_discriminante` (crates/orkai-core/src/node.rs) trava o
// formato do lado do Rust. Trocar por geracao via `ts-rs` quando passar de ~10 tipos.

export interface Vec2 {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  pan: Vec2;
  zoom: number;
}

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;

export type NodeKind =
  | { type: 'terminal'; cwd: string; shell: string }
  | { type: 'markdown'; filePath: string; color: string }
  | { type: 'frame'; title: string }
  | {
      type: 'agent';
      name: string;
      role: string;
      command: string;
      args: string[];
      cwd: string;
      systemPrompt: string;
    };

export type NodeKindTag = NodeKind['type'];

export interface CanvasNode {
  id: string;
  kind: NodeKind;
  position: Vec2;
  size: Size;
  zIndex: number;
  createdAt: number;
}

export interface Connection {
  id: string;
  from: string;
  to: string;
}

export interface Workspace {
  id: string;
  name: string;
  viewport: Viewport;
  nodes: CanvasNode[];
  connections: Connection[];
}

/** Payload de `pty://data/{id}`. */
export interface PtyDataEvent {
  nodeId: string;
  data: string;
}

/** Payload de `pty://exit/{id}`. */
export interface PtyExitEvent {
  nodeId: string;
  code: number;
}
