import type { CanvasNode, Vec2 } from '../ipc/types';
import type { Rect } from './snapping';

/** Retangulo normalizado a partir de dois cantos, em qualquer ordem de arrasto. */
export function rectFromPoints(a: Vec2, b: Vec2): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** Nos que a marquise toca. Encostar basta — exigir conter inteiro irrita na pratica. */
export function nodesInRect(nodes: CanvasNode[], rect: Rect): string[] {
  return nodes
    .filter(
      (n) =>
        n.position.x < rect.x + rect.width &&
        n.position.x + n.size.width > rect.x &&
        n.position.y < rect.y + rect.height &&
        n.position.y + n.size.height > rect.y,
    )
    .map((n) => n.id);
}

/**
 * Nova selecao apos um clique.
 *
 * `additive` (Shift/Ctrl) alterna o item; sem ele, o clique passa a ser a selecao
 * inteira — salvo quando o no ja estava selecionado, para nao quebrar o arrasto de
 * um grupo ao pegar num dos membros.
 */
export function toggleSelection(atual: Set<string>, id: string, additive: boolean): Set<string> {
  if (additive) {
    const proxima = new Set(atual);
    if (!proxima.delete(id)) proxima.add(id);
    return proxima;
  }
  return atual.has(id) ? atual : new Set([id]);
}

/**
 * Nos inteiramente contidos num frame, que se movem junto com ele.
 *
 * Contencao e geometrica, nao um campo `parentId`: arrastar um no para dentro do frame
 * ja o torna conteudo, sem estado extra para manter em sincronia.
 */
export function nodesInsideFrame(nodes: CanvasNode[], frameId: string): string[] {
  const frame = nodes.find((n) => n.id === frameId);
  if (!frame || frame.kind.type !== 'frame') return [];

  const [fx1, fy1] = [frame.position.x + frame.size.width, frame.position.y + frame.size.height];
  return nodes
    .filter((n) => n.id !== frameId && n.kind.type !== 'frame')
    .filter(
      (n) =>
        n.position.x >= frame.position.x &&
        n.position.y >= frame.position.y &&
        n.position.x + n.size.width <= fx1 &&
        n.position.y + n.size.height <= fy1,
    )
    .map((n) => n.id);
}

/**
 * Ids que um gesto de arrasto deve mover: a selecao mais o conteudo dos frames nela.
 */
export function nodesToDrag(nodes: CanvasNode[], selectedIds: Set<string>): Set<string> {
  const alvos = new Set(selectedIds);
  for (const id of selectedIds) {
    for (const filho of nodesInsideFrame(nodes, id)) {
      alvos.add(filho);
    }
  }
  return alvos;
}

/** Retangulo que envolve todos os nos, para "enquadrar tudo" e para o minimapa. */
export function boundingBox(nodes: CanvasNode[]): Rect | null {
  if (nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + n.size.width);
    maxY = Math.max(maxY, n.position.y + n.size.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
