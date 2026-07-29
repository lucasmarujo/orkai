import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasNode } from '../ipc/types';
import { MarkdownNode } from './MarkdownNode';

// A nota lê e escreve um arquivo de verdade; nos testes o backend não existe.
vi.mock('../ipc/commands', () => ({
  fileRead: vi.fn(async () => '# Título\n\n- um\n- dois'),
  fileWrite: vi.fn(async () => undefined),
}));

const estadoFake = { setNoteColor: vi.fn(async () => undefined) };
vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: (seletor: (s: typeof estadoFake) => unknown) => seletor(estadoFake),
}));

const nota: CanvasNode = {
  id: 'n1',
  kind: { type: 'markdown', filePath: 'a.md', color: '' },
  position: { x: 0, y: 0 },
  size: { width: 480, height: 400 },
  zIndex: 1,
  createdAt: 0,
};

const editor = () => screen.getByLabelText('Markdown da nota');
const preview = () => document.querySelector('.markdown-preview');

describe('MarkdownNode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('abre no modo estilizado, mostrando o Markdown renderizado', async () => {
    render(<MarkdownNode node={nota} />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Título' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    // Sem preview cru: o `#` e o `-` viraram marcação.
    expect(preview()?.textContent).not.toContain('# Título');
  });

  it('o botão troca para o Markdown sem estilo', async () => {
    render(<MarkdownNode node={nota} />);
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Sem estilo' }));

    expect((editor() as HTMLTextAreaElement).value).toBe('# Título\n\n- um\n- dois');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(preview()).toBeNull();
  });

  it('o botão volta para o Markdown com estilo', async () => {
    render(<MarkdownNode node={nota} />);
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Sem estilo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Com estilo' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Título' })).toBeTruthy();
  });

  it('o preview acompanha ao vivo o que está sendo digitado', async () => {
    render(<MarkdownNode node={nota} />);
    const leitura = await screen.findByRole('heading', { level: 1 });

    // Duplo clique entra em edição: editor em cima, preview ao vivo embaixo.
    fireEvent.doubleClick(leitura);
    fireEvent.change(editor(), { target: { value: '## Outro\n\n- só um' } });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Outro' })).toBeTruthy();
    });
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    // O editor continua ali junto do preview — é isso que faz o "ao vivo".
    expect(editor()).toBeTruthy();
  });

  it('sanitiza o HTML embutido no Markdown', async () => {
    const api = await import('../ipc/commands');
    vi.mocked(api.fileRead).mockResolvedValueOnce('<img src=x onerror="alert(1)">');

    render(<MarkdownNode node={nota} />);

    await waitFor(() => expect(document.querySelector('img')).toBeTruthy());
    expect(document.querySelector('img')?.getAttribute('onerror')).toBeNull();
  });
});
