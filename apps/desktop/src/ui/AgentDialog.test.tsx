import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentDialog } from './AgentDialog';

// A checagem do PATH e o worktree vão ao backend; nos testes o Tauri não existe.
const commandAvailable = vi.fn(async (_command: string) => true);
const gitWorkflowIsRepo = vi.fn(async () => false);
const gitWorktreeCreate = vi.fn(async (_name: string) => 'C:/dados/worktrees/claude-code-qa');
vi.mock('../ipc/commands', () => ({
  commandAvailable: (command: string) => commandAvailable(command),
  gitWorkflowIsRepo: () => gitWorkflowIsRepo(),
  gitWorktreeCreate: (name: string) => gitWorktreeCreate(name),
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
    gitWorkflowIsRepo.mockResolvedValue(false);
    gitWorktreeCreate.mockResolvedValue('C:/dados/worktrees/claude-code-qa');
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

  it('não oferece isolamento fora de um repositório git', async () => {
    abrir();

    await waitFor(() => expect(gitWorkflowIsRepo).toHaveBeenCalled());
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('cria o worktree antes do nó e usa a pasta dele como cwd', async () => {
    gitWorkflowIsRepo.mockResolvedValue(true);
    const onCreate = abrir();

    const isolar = await screen.findByRole('checkbox');
    fireEvent.click(isolar);
    fireEvent.click(botaoCriar());

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(gitWorktreeCreate).toHaveBeenCalledWith('Claude Code · Architect');
    expect(onCreate.mock.calls[0]![0]).toMatchObject({
      cwd: 'C:/dados/worktrees/claude-code-qa',
    });
  });

  it('não cria o nó quando o git recusa o worktree', async () => {
    // Sem isto sobraria um agente apontando para uma pasta que nunca existiu.
    gitWorkflowIsRepo.mockResolvedValue(true);
    gitWorktreeCreate.mockRejectedValue(new Error('o repositorio ainda nao tem commits'));
    const onCreate = abrir();

    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(botaoCriar());

    const aviso = await screen.findByRole('alert');
    expect(aviso.textContent).toContain('nao tem commits');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('não bloqueia quando a própria checagem falha', async () => {
    commandAvailable.mockRejectedValue(new Error('backend fora'));
    abrir();

    await waitFor(() => expect(commandAvailable).toHaveBeenCalled());
    expect(botaoCriar().disabled).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
