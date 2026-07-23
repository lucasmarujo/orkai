import { describe, expect, it } from 'vitest';

import { ZOOM_MAX, ZOOM_MIN, type Viewport } from '../ipc/types';
import {
  clampZoom,
  panBy,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
} from './viewport';

const identidade: Viewport = { pan: { x: 0, y: 0 }, zoom: 1 };
const deslocada: Viewport = { pan: { x: 100, y: -50 }, zoom: 2 };

describe('clampZoom', () => {
  it('limita ao intervalo e trata valores nao finitos', () => {
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(1.5)).toBe(1.5);
  });
});

describe('conversao tela <-> mundo', () => {
  it('e identidade com pan zero e zoom 1', () => {
    expect(worldToScreen(identidade, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });

  it('aplica pan antes do zoom', () => {
    expect(worldToScreen(deslocada, { x: 150, y: -50 })).toEqual({ x: 100, y: 0 });
  });

  it('screenToWorld desfaz worldToScreen', () => {
    for (const viewport of [identidade, deslocada, { pan: { x: -7.5, y: 3.25 }, zoom: 0.35 }]) {
      const mundo = { x: 123.5, y: -456.25 };
      const volta = screenToWorld(viewport, worldToScreen(viewport, mundo));
      expect(volta.x).toBeCloseTo(mundo.x, 5);
      expect(volta.y).toBeCloseTo(mundo.y, 5);
    }
  });
});

describe('panBy', () => {
  it('move o mundo na direcao do arrasto, escalado pelo zoom', () => {
    // Arrastar 100px para a direita com zoom 2 move a camera 50 unidades de mundo.
    expect(panBy(deslocada, { x: 100, y: 0 }).pan).toEqual({ x: 50, y: -50 });
  });

  it('nao altera o zoom', () => {
    expect(panBy(deslocada, { x: 10, y: 10 }).zoom).toBe(deslocada.zoom);
  });
});

describe('zoomAt', () => {
  it('mantem o ponto do mundo sob o cursor', () => {
    const ancora = { x: 640, y: 360 };
    const antes = screenToWorld(deslocada, ancora);
    const depois = screenToWorld(zoomAt(deslocada, ancora, 1.25), ancora);
    expect(depois.x).toBeCloseTo(antes.x, 4);
    expect(depois.y).toBeCloseTo(antes.y, 4);
  });

  it('respeita os limites e devolve o mesmo viewport quando ja esta no limite', () => {
    const noMaximo: Viewport = { pan: { x: 0, y: 0 }, zoom: ZOOM_MAX };
    expect(zoomAt(noMaximo, { x: 0, y: 0 }, 2)).toBe(noMaximo);
    expect(zoomAt(identidade, { x: 0, y: 0 }, 1000).zoom).toBe(ZOOM_MAX);
    expect(zoomAt(identidade, { x: 0, y: 0 }, 0.0001).zoom).toBe(ZOOM_MIN);
  });
});

describe('visibleWorldRect', () => {
  it('cobre exatamente a tela no espaco do mundo', () => {
    expect(visibleWorldRect(deslocada, 800, 600)).toEqual({
      minX: 100,
      minY: -50,
      maxX: 500,
      maxY: 250,
    });
  });

  it('cresce quando o zoom diminui', () => {
    const perto = visibleWorldRect({ pan: { x: 0, y: 0 }, zoom: 2 }, 800, 600);
    const longe = visibleWorldRect({ pan: { x: 0, y: 0 }, zoom: 0.5 }, 800, 600);
    expect(longe.maxX - longe.minX).toBeGreaterThan(perto.maxX - perto.minX);
  });
});
