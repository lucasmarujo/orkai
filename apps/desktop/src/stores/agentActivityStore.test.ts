import { beforeEach, describe, expect, it } from 'vitest';

import { useAgentActivity } from './agentActivityStore';

const reset = () => useAgentActivity.setState({ byId: {} });
const get = (id: string) => useAgentActivity.getState().byId[id];

describe('agentActivityStore', () => {
  beforeEach(reset);

  it('registra um agente como rodando', () => {
    useAgentActivity.getState().register('a');
    expect(get('a')?.status).toBe('running');
    expect(get('a')?.turns).toBe(0);
  });

  it('conta turnos', () => {
    const s = useAgentActivity.getState();
    s.register('a');
    s.markTurn('a');
    s.markTurn('a');
    expect(get('a')?.turns).toBe(2);
  });

  it('remontar não zera os turnos já contados', () => {
    const s = useAgentActivity.getState();
    s.register('a');
    s.markTurn('a');
    s.register('a'); // virtualização remontou o nó
    expect(get('a')?.turns).toBe(1);
    expect(get('a')?.status).toBe('running');
  });

  it('marca saída com o código', () => {
    const s = useAgentActivity.getState();
    s.register('a');
    s.markExit('a', 0);
    expect(get('a')?.status).toBe('exited');
    expect(get('a')?.exitCode).toBe(0);
  });

  it('ignora turno/saída de agente não registrado', () => {
    const s = useAgentActivity.getState();
    s.markTurn('fantasma');
    s.markExit('fantasma', 1);
    expect(get('fantasma')).toBeUndefined();
  });

  it('unregister remove o agente', () => {
    const s = useAgentActivity.getState();
    s.register('a');
    s.unregister('a');
    expect(get('a')).toBeUndefined();
  });
});
