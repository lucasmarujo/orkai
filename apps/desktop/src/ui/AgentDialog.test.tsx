import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentDialog } from './AgentDialog';

// A checagem do PATH vai ao backend; nos testes o Tauri não existe.
const commandAvailable = vi.fn(async (_command: string) => true);
vi.mock('../ipc/commands', () => ({
  commandAvailable: (command: string) => commandAvailable(command),
}));

const estadoFake = { custom: [], load: vi.fn(async () => undefined) };
vi.mock('../stores/rolesStore', () => ({
  useRoles: (seletor: (s: typeof estadoFake) => unknown) => seletor(estadoFake),
}));

const botaoCriar = () => screen.getByRole('button', { name: 'Criar agente' }) as HTMLButtonElement;

const abrir = (onCreate = vi.fn()) => {
  render(<AgentDialog defaultCwd="C:/dev/proj" onCancel={vi.fn()} onCreate={onCreate} />);
  return onCreate;
};

describe('AgentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandAvailable.mockResolvedValue(true);
  });

  it('cria o agente quando o CLI do provider está no PATH', async () => {
    const onCreate = abrir();

    await waitFor(() => expect(commandAvailable).toHaveBeenCalledWith('claude'));
    expect(botaoCriar().disabled).toBe(false);

    fireEvent.click(botaoCriar());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ type: 'agent', command: 'claude' });
  });

  it('avisa e bloqueia a criação quando o CLI não existe', async () => {
    // Regressão: escolher o Codex sem ele instalado criava um nó que morria com
    // "os error 2" no primeiro spawn, sem explicar o motivo.
    commandAvailable.mockImplementation(async (command: string) => command !== 'codex');
    const onCreate = abrir();

    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'codex' } });

    const aviso = await screen.findByRole('alert');
    expect(aviso.textContent).toContain('codex');
    expect(botaoCriar().disabled).toBe(true);

    fireEvent.click(botaoCriar());
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('recheca ao voltar para um provider instalado e libera o botão', async () => {
    commandAvailable.mockImplementation(async (command: string) => command !== 'codex');
    abrir();

    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'codex' } });
    await waitFor(() => expect(botaoCriar().disabled).toBe(true));

    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'claude' } });
    await waitFor(() => expect(botaoCriar().disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('não bloqueia quando a própria checagem falha', async () => {
    commandAvailable.mockRejectedValue(new Error('backend fora'));
    abrir();

    await waitFor(() => expect(commandAvailable).toHaveBeenCalled());
    expect(botaoCriar().disabled).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
