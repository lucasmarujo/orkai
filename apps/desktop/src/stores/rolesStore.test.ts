import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRoles } from './rolesStore';

// O store persiste via IPC; nos testes o backend não existe.
vi.mock('../ipc/commands', () => ({
  rolesLoad: vi.fn(async () => '[]'),
  rolesSave: vi.fn(async () => undefined),
}));

const reset = () => useRoles.setState({ custom: [] });

describe('rolesStore', () => {
  beforeEach(reset);

  it('mantém a referência de `custom` estável entre leituras', () => {
    // Regressão: um seletor que devolvia array novo a cada render fazia o Zustand
    // ver mudança sempre e travava a UI em re-render infinito.
    const a = useRoles.getState().custom;
    const b = useRoles.getState().custom;
    expect(a).toBe(b);
  });

  it('cria uma role com id derivado do nome', async () => {
    await useRoles.getState().upsert({ label: 'Security', systemPrompt: 'Foque em ameaças.' });
    const [role] = useRoles.getState().custom;
    expect(role?.id).toBe('security');
    expect(role?.systemPrompt).toBe('Foque em ameaças.');
  });

  it('editar por id substitui em vez de duplicar', async () => {
    const { upsert } = useRoles.getState();
    await upsert({ label: 'Security', systemPrompt: 'v1' });
    await upsert({ id: 'security', label: 'Security', systemPrompt: 'v2' });

    const custom = useRoles.getState().custom;
    expect(custom).toHaveLength(1);
    expect(custom[0]?.systemPrompt).toBe('v2');
  });

  it('ignora nome vazio', async () => {
    await useRoles.getState().upsert({ label: '   ', systemPrompt: 'x' });
    expect(useRoles.getState().custom).toHaveLength(0);
  });

  it('gera id de fallback quando o nome não produz slug', async () => {
    await useRoles.getState().upsert({ label: '???', systemPrompt: '' });
    expect(useRoles.getState().custom[0]?.id).toMatch(/^role-\d+$/);
  });

  it('remove uma role', async () => {
    await useRoles.getState().upsert({ label: 'Temp', systemPrompt: '' });
    await useRoles.getState().remove('temp');
    expect(useRoles.getState().custom).toHaveLength(0);
  });

  it('load ignora JSON malformado sem derrubar', async () => {
    const api = await import('../ipc/commands');
    vi.mocked(api.rolesLoad).mockResolvedValueOnce('não é json');
    await useRoles.getState().load();
    expect(useRoles.getState().custom).toEqual([]);
  });

  it('load descarta entradas sem o shape esperado', async () => {
    const api = await import('../ipc/commands');
    vi.mocked(api.rolesLoad).mockResolvedValueOnce(
      JSON.stringify([{ id: 'ok', label: 'OK', systemPrompt: '' }, { lixo: true }, null]),
    );
    await useRoles.getState().load();
    expect(useRoles.getState().custom).toHaveLength(1);
  });
});
