import type { Size, Vec2 } from '../ipc/types';

/**
 * Redimensionamento por qualquer borda ou canto.
 *
 * Arrastar a borda esquerda ou o topo muda a posição junto com o tamanho — a borda
 * oposta é que fica ancorada. Ao bater no tamanho mínimo, a âncora não pode escorregar:
 * é por isso que a posição é derivada da borda fixa, e não somada ao delta.
 */

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export const MIN_SIDE = 80;

/** Cursor CSS de cada alça. */
export const CURSOR: Record<Handle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

export function resizeRect(
  position: Vec2,
  size: Size,
  handle: Handle,
  delta: Vec2,
  minSide = MIN_SIDE,
): { position: Vec2; size: Size } {
  // Bordas atuais; as que a alça não move permanecem ancoradas.
  const esquerda = position.x;
  const topo = position.y;
  const direita = position.x + size.width;
  const base = position.y + size.height;

  let novaEsquerda = esquerda;
  let novoTopo = topo;
  let novaDireita = direita;
  let novaBase = base;

  if (handle.includes('w')) novaEsquerda = Math.min(esquerda + delta.x, direita - minSide);
  if (handle.includes('e')) novaDireita = Math.max(direita + delta.x, esquerda + minSide);
  if (handle.includes('n')) novoTopo = Math.min(topo + delta.y, base - minSide);
  if (handle.includes('s')) novaBase = Math.max(base + delta.y, topo + minSide);

  return {
    position: { x: novaEsquerda, y: novoTopo },
    size: { width: novaDireita - novaEsquerda, height: novaBase - novoTopo },
  };
}
