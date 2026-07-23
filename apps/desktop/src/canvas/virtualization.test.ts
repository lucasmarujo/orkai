import { describe, expect, it } from 'vitest';

import type { CanvasNode, Viewport } from '../ipc/types';
import { OVERSCAN, intersects, overscanRect, visibleNodes } from './virtualization';

const viewport: Viewport = { pan: { x: 0, y: 0 }, zoom: 1 };
const TELA = { width: 800, height: 600 };

function no(x: number, y: number, id = `${x}:${y}`): CanvasNode {
  return {
    id,
    kind: { type: 'markdown', filePath: 'a.md', color: '' },
    position: { x, y },
    size: { width: 200, height: 150 },
    zIndex: 0,
    createdAt: 0,
  };
}

describe('overscanRect', () => {
  it('expande o retangulo visivel pela margem configurada', () => {
    const rect = overscanRect(viewport, TELA.width, TELA.height);
    expect(rect.minX).toBe(-TELA.width * OVERSCAN);
    expect(rect.maxX).toBe(TELA.width * (1 + OVERSCAN));
  });
});

describe('intersects', () => {
  const rect = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  it('aceita no sobrepondo a borda', () => {
    expect(intersects(no(-50, -50), rect)).toBe(true);
  });

  it('rejeita no totalmente fora', () => {
    expect(intersects(no(500, 0), rect)).toBe(false);
    expect(intersects(no(0, -1000), rect)).toBe(false);
  });

  it('trata encostar sem sobrepor como fora', () => {
    expect(intersects(no(100, 0), rect)).toBe(false);
  });
});

describe('visibleNodes', () => {
  it('monta o que esta na tela e descarta o que esta longe', () => {
    const dentro = no(100, 100, 'dentro');
    const longe = no(100_000, 100_000, 'longe');
    const ids = visibleNodes([dentro, longe], viewport, TELA.width, TELA.height).map((n) => n.id);
    expect(ids).toEqual(['dentro']);
  });

  it('mantem montado o no que ficou dentro da margem de overscan', () => {
    const naMargem = no(-100, 0, 'margem');
    const ids = visibleNodes([naMargem], viewport, TELA.width, TELA.height).map((n) => n.id);
    expect(ids).toEqual(['margem']);
  });

  it('mostra mais nos quando o zoom diminui', () => {
    const nos = Array.from({ length: 50 }, (_, i) => no(i * 300, 0, `n${i}`));
    const perto = visibleNodes(nos, { pan: { x: 0, y: 0 }, zoom: 2 }, TELA.width, TELA.height);
    const longe = visibleNodes(nos, { pan: { x: 0, y: 0 }, zoom: 0.2 }, TELA.width, TELA.height);
    expect(longe.length).toBeGreaterThan(perto.length);
    expect(longe.length).toBeLessThan(nos.length);
  });
});
