import { describe, expect, it } from 'vitest';

import { HANDLES, MIN_SIDE, resizeRect } from './resize';

const pos = { x: 100, y: 100 };
const size = { width: 300, height: 200 };

describe('resizeRect', () => {
  it('borda direita e inferior crescem sem mover a posição', () => {
    const e = resizeRect(pos, size, 'e', { x: 50, y: 0 });
    expect(e.position).toEqual(pos);
    expect(e.size).toEqual({ width: 350, height: 200 });

    const s = resizeRect(pos, size, 's', { x: 0, y: 40 });
    expect(s.position).toEqual(pos);
    expect(s.size.height).toBe(240);
  });

  it('borda esquerda move a posição e ancora a direita', () => {
    const r = resizeRect(pos, size, 'w', { x: -50, y: 0 });
    expect(r.position.x).toBe(50);
    expect(r.size.width).toBe(350);
    // A borda direita não se moveu.
    expect(r.position.x + r.size.width).toBe(pos.x + size.width);
  });

  it('borda superior move a posição e ancora a base', () => {
    const r = resizeRect(pos, size, 'n', { x: 0, y: -30 });
    expect(r.position.y).toBe(70);
    expect(r.size.height).toBe(230);
    expect(r.position.y + r.size.height).toBe(pos.y + size.height);
  });

  it('canto redimensiona nos dois eixos', () => {
    const r = resizeRect(pos, size, 'nw', { x: -20, y: -10 });
    expect(r.position).toEqual({ x: 80, y: 90 });
    expect(r.size).toEqual({ width: 320, height: 210 });
  });

  it('respeita o mínimo sem deixar a âncora escorregar', () => {
    // Arrasto exagerado pela esquerda: trava no mínimo e a direita fica onde estava.
    const r = resizeRect(pos, size, 'w', { x: 9999, y: 0 });
    expect(r.size.width).toBe(MIN_SIDE);
    expect(r.position.x + r.size.width).toBe(pos.x + size.width);
  });

  it('mínimo também vale para as bordas que não movem a posição', () => {
    const r = resizeRect(pos, size, 'e', { x: -9999, y: 0 });
    expect(r.size.width).toBe(MIN_SIDE);
    expect(r.position.x).toBe(pos.x);
  });

  it('eixo não tocado pela alça fica intacto', () => {
    const r = resizeRect(pos, size, 'e', { x: 30, y: 999 });
    expect(r.size.height).toBe(size.height);
    expect(r.position.y).toBe(pos.y);
  });

  it('arrasto nulo não altera nada, em nenhuma alça', () => {
    for (const h of HANDLES) {
      const r = resizeRect(pos, size, h, { x: 0, y: 0 });
      expect(r.position).toEqual(pos);
      expect(r.size).toEqual(size);
    }
  });
});
