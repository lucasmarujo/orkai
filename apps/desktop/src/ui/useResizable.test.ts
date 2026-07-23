import { describe, expect, it } from 'vitest';

import { LARGURA_MAX, LARGURA_MIN, nextWidth } from './useResizable';

describe('nextWidth', () => {
  it('sidebar esquerda cresce ao arrastar para a direita', () => {
    expect(nextWidth(220, 40, 'left')).toBe(260);
    expect(nextWidth(220, -40, 'left')).toBe(180);
  });

  it('painel direito cresce ao arrastar para a esquerda', () => {
    expect(nextWidth(280, -40, 'right')).toBe(320);
    expect(nextWidth(280, 40, 'right')).toBe(240);
  });

  it('respeita os limites nos dois sentidos', () => {
    expect(nextWidth(220, -9999, 'left')).toBe(LARGURA_MIN);
    expect(nextWidth(220, 9999, 'left')).toBe(LARGURA_MAX);
    expect(nextWidth(280, 9999, 'right')).toBe(LARGURA_MIN);
    expect(nextWidth(280, -9999, 'right')).toBe(LARGURA_MAX);
  });

  it('arrasto nulo mantém a largura', () => {
    expect(nextWidth(300, 0, 'left')).toBe(300);
    expect(nextWidth(300, 0, 'right')).toBe(300);
  });

  it('arredonda para pixel inteiro', () => {
    expect(nextWidth(220, 10.6, 'left')).toBe(231);
  });

  it('ignora valores não finitos em vez de quebrar o layout', () => {
    expect(nextWidth(300, NaN, 'left')).toBe(300);
    expect(nextWidth(300, Infinity, 'right')).toBe(300);
  });

  it('aceita limites customizados', () => {
    expect(nextWidth(200, 500, 'left', 100, 300)).toBe(300);
  });
});
