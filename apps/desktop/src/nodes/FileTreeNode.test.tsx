import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasNode } from '../ipc/types';
import { FileTreeNode } from './FileTreeNode';

const dirList = vi.fn(async (path: string) =>
  path === ''
    ? [
        { name: 'src', path: 'src', isDir: true },
        { name: 'README.md', path: 'README.md', isDir: false },
        { name: 'logo.png', path: 'logo.png', isDir: false },
      ]
    : [{ name: 'lib.rs', path: 'src/lib.rs', isDir: false }],
);

vi.mock('../ipc/commands', () => ({ dirList: (path: string) => dirList(path) }));

const createNode = vi.fn(async () => undefined);
const setSelection = vi.fn();
let nodes: CanvasNode[] = [];

vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: Object.assign(
    (seletor: (s: { createNode: typeof createNode; nodes: CanvasNode[] }) => unknown) =>
      seletor({ createNode, nodes }),
    { getState: () => ({ setSelection }) },
  ),
}));

const node: CanvasNode = {
  id: 'arvore',
  kind: { type: 'fileTree', root: '' },
  position: { x: 100, y: 50 },
  size: { width: 320, height: 480 },
  zIndex: 0,
  createdAt: 0,
};

describe('FileTreeNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nodes = [];
  });

  it('lista a raiz ao montar', async () => {
    render(<FileTreeNode node={node} />);
    await waitFor(() => expect(screen.getByText('README.md')).toBeTruthy());
    expect(dirList).toHaveBeenCalledWith('');
  });

  it('expandir uma pasta busca o caminho dela, e colapsar remove o nível', async () => {
    render(<FileTreeNode node={node} />);
    const pasta = await screen.findByText('src');

    fireEvent.click(pasta);
    await waitFor(() => expect(dirList).toHaveBeenCalledWith('src'));
    expect(screen.getByText('lib.rs')).toBeTruthy();

    fireEvent.click(pasta);
    await waitFor(() => expect(screen.queryByText('lib.rs')).toBeNull());
  });

  it('clicar num .md cria uma nota ao lado da árvore', async () => {
    render(<FileTreeNode node={node} />);
    fireEvent.click(await screen.findByText('README.md'));

    await waitFor(() =>
      expect(createNode).toHaveBeenCalledWith(
        { type: 'markdown', filePath: 'README.md', color: '' },
        { x: 460, y: 50 },
      ),
    );
  });

  it('clicar num arquivo que a nota não mostra não cria nada', async () => {
    render(<FileTreeNode node={node} />);
    fireEvent.click(await screen.findByText('logo.png'));

    await waitFor(() => expect(dirList).toHaveBeenCalled());
    expect(createNode).not.toHaveBeenCalled();
  });

  it('foca a nota existente em vez de abrir uma segunda no mesmo arquivo', async () => {
    // Duas telas editando o mesmo disco: a última a salvar venceria em silêncio.
    nodes = [{ ...node, id: 'nota', kind: { type: 'markdown', filePath: 'README.md', color: '' } }];
    render(<FileTreeNode node={node} />);
    fireEvent.click(await screen.findByText('README.md'));

    await waitFor(() => expect(setSelection).toHaveBeenCalledWith(new Set(['nota'])));
    expect(createNode).not.toHaveBeenCalled();
  });
});
