import { ZOOM_MAX, ZOOM_MIN, type Vec2, type Viewport } from '../ipc/types';

/**
 * Matematica da camera do canvas.
 *
 * Uma unica transformacao para todo o app: `tela = (mundo - pan) * zoom`.
 * Toda conversao passa por aqui — divergencia entre a camada WebGL e a camada DOM
 * e a fonte numero 1 de bug em canvas infinito.
 */

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export function worldToScreen(viewport: Viewport, world: Vec2): Vec2 {
  return {
    x: (world.x - viewport.pan.x) * viewport.zoom,
    y: (world.y - viewport.pan.y) * viewport.zoom,
  };
}

export function screenToWorld(viewport: Viewport, screen: Vec2): Vec2 {
  return {
    x: screen.x / viewport.zoom + viewport.pan.x,
    y: screen.y / viewport.zoom + viewport.pan.y,
  };
}

/** Desloca a camera por um arrasto medido em pixels de tela. */
export function panBy(viewport: Viewport, deltaScreen: Vec2): Viewport {
  return {
    ...viewport,
    pan: {
      x: viewport.pan.x - deltaScreen.x / viewport.zoom,
      y: viewport.pan.y - deltaScreen.y / viewport.zoom,
    },
  };
}

/**
 * Aplica zoom mantendo fixo o ponto do mundo sob o cursor — o comportamento que
 * o usuario espera da roda do mouse.
 */
export function zoomAt(viewport: Viewport, screenAnchor: Vec2, factor: number): Viewport {
  const zoom = clampZoom(viewport.zoom * factor);
  if (zoom === viewport.zoom) return viewport;

  const anchorWorld = screenToWorld(viewport, screenAnchor);
  return {
    zoom,
    pan: {
      x: anchorWorld.x - screenAnchor.x / zoom,
      y: anchorWorld.y - screenAnchor.y / zoom,
    },
  };
}

/** Centro da tela em coordenadas de mundo — onde nos novos nascem. */
export function screenCenterWorld(
  viewport: Viewport,
  screenWidth: number,
  screenHeight: number,
): Vec2 {
  return screenToWorld(viewport, { x: screenWidth / 2, y: screenHeight / 2 });
}

/** Retangulo do mundo visivel na tela informada. */
export function visibleWorldRect(
  viewport: Viewport,
  screenWidth: number,
  screenHeight: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const topLeft = screenToWorld(viewport, { x: 0, y: 0 });
  const bottomRight = screenToWorld(viewport, { x: screenWidth, y: screenHeight });
  return {
    minX: topLeft.x,
    minY: topLeft.y,
    maxX: bottomRight.x,
    maxY: bottomRight.y,
  };
}
