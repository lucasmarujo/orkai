import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommandPalette } from './CommandPalette';

const searchQuery = vi.fn(async () => []);
const searchReindex = vi.fn(async () => 0);
const ptyWrite = vi.fn(async () => undefined);

vi.mock('../ipc/commands', () => ({
  searchQuery: (termo: string) => searchQuery(termo),
  searchReindex: () => searchReindex(),
  ptyWrite: (nodeId: string, data: string) => ptyWrite(nodeId, data),
  ptyDefaultShell: async () => 'pwsh.exe',
}));

const setViewport = vi.fn();
const setSelection = vi.fn();
const createNode = vi.fn(async () => undefined);

const no = (id: string, nome: string) => ({
  id,
  kind: { type: 'agent' as const, name: nome, role: '', command: '', args: [], cwd: '', systemPrompt: '' },
  position: { x: 0, y: 0 },
  size: { width: 100, height: 100 },
  zIndex: 0,
  createdAt: 0,
});

const estadoWorkspace = {
  nodes: [no('no-1', 'Pesquisador')],
  selectedIds: new Set<string>(),
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  setViewport,
  setSelection,
  createNode,
  undo: vi.fn(),
  redo: vi.fn(),
};

vi.mock('../stores/workspaceStore', () => ({
  DEFAULT_NODE_SIZE: {
    terminal: { width: 640, height: 420 },
    markdown: { width: 480, height: 400 },
    frame: { width: 900, height: 640 },
    agent: { width: 680, height: 460 },
    git: { width: 760, height: 520 },
    fileTree: { width: 320, height: 480 },
  },
  useWorkspaceStore: Object.assign(
    (seletor: (s: typeof estadoWorkspace) => unknown) => seletor(estadoWorkspace),
    { getState: () => estadoWorkspace },
  ),
}));

const estadoPrompts = {
  prompts: [{ id: 'p1', nome: 'Revisor de PR', texto: 'Revise o PR', tags: [], revisoes: [] }],
  load: vi.fn(async () => undefined),
};
vi.mock('../stores/promptsStore', () => ({
  usePrompts: (seletor: (s: typeof estadoPrompts) => unknown) => seletor(estadoPrompts),
}));

const estadoWorkflow = { workflows: [] };
vi.mock('../stores/workflowStore', () => ({
  useWorkflowStore: Object.assign(
    (seletor: (s: typeof estadoWorkflow) => unknown) => seletor(estadoWorkflow),
    { getState: () => ({ activate: vi.fn() }) },
  ),
}));

const abrir = (onClose = vi.fn()) => {
  render(<CommandPalette onClose={onClose} onToggleTheme={vi.fn()} />);
  return onClose;
};

const input = () => screen.getByLabelText('Termo de busca') as HTMLInputElement;
const opcoes = () => screen.getAllByRole('option');

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estadoWorkspace.selectedIds = new Set<string>();
  });

  it('reconstrói o índice ao abrir', () => {
    abrir();
    expect(searchReindex).toHaveBeenCalledTimes(1);
  });

  it('fecha com Escape', () => {
    const onClose = abrir();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('a seta para baixo move a seleção e Enter executa o item ativo', () => {
    abrir();
    fireEvent.change(input(), { target: { value: 'no' } });

    const primeiro = opcoes()[0] as HTMLElement;
    expect(primeiro.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(opcoes()[1]?.getAttribute('aria-selected')).toBe('true');
    expect(opcoes()[0]?.getAttribute('aria-selected')).toBe('false');
  });

  it('ir para um nó seleciona e centraliza o viewport nele', () => {
    abrir();
    fireEvent.change(input(), { target: { value: 'Pesquisador' } });
    fireEvent.click(screen.getByText('Pesquisador'));

    expect(setSelection).toHaveBeenCalledWith(new Set(['no-1']));
    expect(setViewport).toHaveBeenCalled();
  });

  it('desabilita o prompt quando nenhum agente está selecionado', () => {
    abrir();
    fireEvent.change(input(), { target: { value: 'Revisor' } });
    expect((opcoes()[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('envia o prompt ao agente selecionado', async () => {
    estadoWorkspace.selectedIds = new Set(['no-1']);
    abrir();
    fireEvent.change(input(), { target: { value: 'Revisor' } });

    const item = opcoes()[0] as HTMLButtonElement;
    expect(item.disabled).toBe(false);
    fireEvent.click(item);
    await vi.waitFor(() => expect(ptyWrite).toHaveBeenCalledWith('no-1', 'Revise o PR'));
  });
});
