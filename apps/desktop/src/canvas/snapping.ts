import type { CanvasNode, Vec2 } from '../ipc/types';

/**
 * Snap ao grid e guias de alinhamento.
 *
 * Tudo em coordenadas de mundo. O limiar e convertido de pixels de tela pelo chamador,
 * senao o ima ficaria forte demais com zoom baixo e fraco demais com zoom alto.
 */

export const GRID = 32;

/** Distancia em pixels de tela dentro da qual o alinhamento gruda. */
export const SNAP_THRESHOLD_PX = 8;

export interface Guide {
  axis: 'x' | 'y';
  /** Coordenada de mundo da linha. */
  at: number;
  /** Extensao da linha no eixo oposto, para nao desenhar de ponta a ponta do mundo. */
  from: number;
  to: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectOf(node: CanvasNode): Rect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height,
  };
}

/** `Math.round` devolve `-0` para entradas negativas pequenas; zero e zero. */
function semZeroNegativo(v: number): number {
  return v === 0 ? 0 : v;
}

export function snapToGrid(position: Vec2, grid = GRID): Vec2 {
  return {
    x: semZeroNegativo(Math.round(position.x / grid) * grid),
    y: semZeroNegativo(Math.round(position.y / grid) * grid),
  };
}

/** Bordas e centro de um retangulo, que sao os pontos que se alinham. */
function marcasX(r: Rect): number[] {
  return [r.x, r.x + r.width / 2, r.x + r.width];
}

function marcasY(r: Rect): number[] {
  return [r.y, r.y + r.height / 2, r.y + r.height];
}

interface Ajuste {
  delta: Vec2;
  guides: Guide[];
}

/**
 * Menor deslocamento que alinha `movendo` a algum dos `outros`.
 *
 * Considera as tres marcas de cada eixo (inicio, centro, fim), e escolhe por eixo a
 * aproximacao mais curta dentro do limiar.
 */
export function alignmentGuides(movendo: Rect, outros: Rect[], threshold: number): Ajuste {
  let melhorX: { delta: number; at: number; alvo: Rect } | null = null;
  let melhorY: { delta: number; at: number; alvo: Rect } | null = null;

  for (const outro of outros) {
    for (const marca of marcasX(movendo)) {
      for (const alvo of marcasX(outro)) {
        const delta = alvo - marca;
        if (Math.abs(delta) <= threshold && (!melhorX || Math.abs(delta) < Math.abs(melhorX.delta))) {
          melhorX = { delta, at: alvo, alvo: outro };
        }
      }
    }
    for (const marca of marcasY(movendo)) {
      for (const alvo of marcasY(outro)) {
        const delta = alvo - marca;
        if (Math.abs(delta) <= threshold && (!melhorY || Math.abs(delta) < Math.abs(melhorY.delta))) {
          melhorY = { delta, at: alvo, alvo: outro };
        }
      }
    }
  }

  const guides: Guide[] = [];
  if (melhorX) {
    guides.push({
      axis: 'x',
      at: melhorX.at,
      from: Math.min(movendo.y, melhorX.alvo.y),
      to: Math.max(movendo.y + movendo.height, melhorX.alvo.y + melhorX.alvo.height),
    });
  }
  if (melhorY) {
    guides.push({
      axis: 'y',
      at: melhorY.at,
      from: Math.min(movendo.x, melhorY.alvo.x),
      to: Math.max(movendo.x + movendo.width, melhorY.alvo.x + melhorY.alvo.width),
    });
  }

  return { delta: { x: melhorX?.delta ?? 0, y: melhorY?.delta ?? 0 }, guides };
}
