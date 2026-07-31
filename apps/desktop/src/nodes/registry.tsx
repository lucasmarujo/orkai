import type { ComponentType } from 'react';

import type { CanvasNode, NodeKind } from '../ipc/types';
import { AgentNode } from './AgentNode';
import { FileTreeNode } from './FileTreeNode';
import { FrameNode } from './FrameNode';
import { GitNode } from './GitNode';
import { MarkdownNode } from './MarkdownNode';
import { TerminalNode } from './TerminalNode';

/**
 * Tipo de no -> componente e titulo.
 *
 * Adicionar um tipo novo e uma entrada aqui mais o variante em `NodeKind` (front e
 * Rust). Nada no canvas conhece tipos concretos.
 */
interface NodeDefinition {
  component: ComponentType<{ node: CanvasNode }>;
  title: (node: CanvasNode) => string;
}

export const nodeRegistry: Record<NodeKind['type'], NodeDefinition> = {
  terminal: {
    component: TerminalNode,
    title: (node) => (node.kind.type === 'terminal' ? node.kind.shell : 'Terminal'),
  },
  markdown: {
    component: MarkdownNode,
    title: (node) => (node.kind.type === 'markdown' ? node.kind.filePath : 'Nota'),
  },
  frame: {
    component: FrameNode,
    title: (node) => (node.kind.type === 'frame' ? node.kind.title : 'Frame'),
  },
  agent: {
    component: AgentNode,
    title: (node) => (node.kind.type === 'agent' ? node.kind.name : 'Agente'),
  },
  git: {
    component: GitNode,
    title: () => 'Git',
  },
  fileTree: {
    component: FileTreeNode,
    title: (node) =>
      node.kind.type === 'fileTree' && node.kind.root ? node.kind.root : 'Arquivos',
  },
};
