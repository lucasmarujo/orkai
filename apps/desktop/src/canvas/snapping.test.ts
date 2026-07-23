import { describe, expect, it } from 'vitest';

import { GRID, alignmentGuides, snapToGrid, type Rect } from './snapping';

const r = (x: number, y: number, width = 100, height = 100): Rect => ({ x, y, width, height });

describe('snapToGrid', () => {
  it('arredonda para o multiplo mais proximo', () => {
    expect(snapToGrid({ x: 5, y: 60 })).toEqual({ x: 0, y: 64 });
    expect(snapToGrid({ x: GRID * 3 + 1, y: -5 })).toEqual({ x: 96, y: 0 });
  });

  it('lida com negativos sem enviesar para zero', () => {
    expect(snapToGrid({ x: -40, y: -100 })).toEqual({ x: -32, y: -96 });
  });
});

describe('alignmentGuides', () => {
  it('nao ajusta nada quando esta longe', () => {
    const ajuste = alignmentGuides(r(0, 0), [r(500, 500)], 8);
    expect(ajuste.delta).toEqual({ x: 0, y: 0 });
    expect(ajuste.guides).toEqual([]);
  });

  it('gruda a borda esquerda quando esta a menos do limiar', () => {
    const ajuste = alignmentGuides(r(103, 400), [r(100, 0)], 8);
    expect(ajuste.delta.x).toBe(-3);
    expect(ajuste.guides.some((g) => g.axis === 'x' && g.at === 100)).toBe(true);
  });

  it('alinha pelo centro, nao so pelas bordas', () => {
    // Movendo centro em 200+50=250; alvo com centro em 248.
    const ajuste = alignmentGuides(r(200, 900, 100, 100), [r(198, 0, 100, 100)], 8);
    expect(ajuste.delta.x).toBe(-2);
  });

  it('escolhe o alinhamento mais proximo quando ha varios candidatos', () => {
    const ajuste = alignmentGuides(r(100, 500), [r(105, 0), r(102, 0)], 8);
    expect(ajuste.delta.x).toBe(2);
  });

  it('ajusta os dois eixos de forma independente', () => {
    const ajuste = alignmentGuides(r(103, 204), [r(100, 200)], 8);
    expect(ajuste.delta).toEqual({ x: -3, y: -4 });
    expect(ajuste.guides).toHaveLength(2);
  });

  it('a guia cobre os dois retangulos envolvidos', () => {
    const ajuste = alignmentGuides(r(103, 400, 100, 100), [r(100, 0, 100, 100)], 8);
    const guia = ajuste.guides.find((g) => g.axis === 'x');
    expect(guia?.from).toBe(0);
    expect(guia?.to).toBe(500);
  });

  it('lista vazia de outros nao quebra', () => {
    expect(alignmentGuides(r(0, 0), [], 8).delta).toEqual({ x: 0, y: 0 });
  });
});
