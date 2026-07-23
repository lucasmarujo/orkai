import type { CanvasNode, Viewport } from '../ipc/types';
import { visibleWorldRect } from './viewport';

/**
 * Margem em volta do viewport, em fracao da tela. Nos dentro dela ja ficam montados
 * antes de aparecer, evitando pop-in ao arrastar o canvas.
 */
export const OVERSCAN = 0.2;

interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function overscanRect(
  viewport: Viewport,
  screenWidth: number,
  screenHeight: number,
): Rect {
  const rect = visibleWorldRect(viewport, screenWidth, screenHeight);
  const marginX = (rect.maxX - rect.minX) * OVERSCAN;
  const marginY = (rect.maxY - rect.minY) * OVERSCAN;
  return {
    minX: rect.minX - marginX,
    minY: rect.minY - marginY,
    maxX: rect.maxX + marginX,
    maxY: rect.maxY + marginY,
  };
}

export function intersects(node: CanvasNode, rect: Rect): boolean {
  return (
    node.position.x < rect.maxX &&
    node.position.x + node.size.width > rect.minX &&
    node.position.y < rect.maxY &&
    node.position.y + node.size.height > rect.minY
  );
}

/**
 * Nos que devem ser montados no DOM. O que da escala ao canvas e isto, nao o renderer:
 * 1000 nos no workspace, algumas dezenas montadas.
 */
export function visibleNodes(
  nodes: CanvasNode[],
  viewport: Viewport,
  screenWidth: number,
  screenHeight: number,
): CanvasNode[] {
  const rect = overscanRect(viewport, screenWidth, screenHeight);
  return nodes.filter((node) => intersects(node, rect));
}
