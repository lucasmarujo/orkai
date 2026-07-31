import { describe, expect, it } from 'vitest';

import type { AgentAttention } from '../ipc/commands';
import { novosEsperando, porNo, porUrgencia, rotuloAtencao } from './attention';

const att = (nodeId: string, status: AgentAttention['status']): AgentAttention => ({
  nodeId,
  status,
  since: 0,
});

describe('novosEsperando', () => {
  it('avisa quem acabou de parar numa pergunta', () => {
    const anterior = { a: 'running' as const };
    expect(novosEsperando(anterior, [att('a', 'waiting')])).toEqual(['a']);
  });

  it('não repete o aviso enquanto o agente continua esperando', () => {
    const anterior = { a: 'waiting' as const };
    expect(novosEsperando(anterior, [att('a', 'waiting')])).toEqual([]);
  });

  it('avisa agente visto pela primeira vez já esperando', () => {
    expect(novosEsperando({}, [att('novo', 'waiting')])).toEqual(['novo']);
  });

  it('ignora quem não está esperando', () => {
    const atual = [att('a', 'running'), att('b', 'idle'), att('c', 'exited')];
    expect(novosEsperando({}, atual)).toEqual([]);
  });
});

describe('porNo', () => {
  it('indexa o status pelo id do nó', () => {
    expect(porNo([att('a', 'idle'), att('b', 'waiting')])).toEqual({ a: 'idle', b: 'waiting' });
  });
});

describe('porUrgencia', () => {
  it('coloca quem espera antes de todo o resto', () => {
    const ordenado = (['exited', 'idle', 'waiting', 'running'] as const)
      .slice()
      .sort(porUrgencia);
    expect(ordenado).toEqual(['waiting', 'running', 'idle', 'exited']);
  });

  it('joga agente sem status para o fim', () => {
    expect(porUrgencia(undefined, 'exited')).toBeGreaterThan(0);
  });
});

describe('rotuloAtencao', () => {
  it('traduz o status e tem rótulo para agente sem sessão', () => {
    expect(rotuloAtencao('waiting')).toBe('precisa de você');
    expect(rotuloAtencao(undefined)).toBe('inativo');
  });
});
