import type { CanvasNode } from '../ipc/types';

/**
 * Moldura de agrupamento. O corpo e vazio de proposito: quem esta dentro sao os nos
 * que caem na area dele, e o clique precisa atravessar para chegar neles.
 */
export function FrameNode({ node }: { node: CanvasNode }) {
  const titulo = node.kind.type === 'frame' ? node.kind.title : '';
  return <div className="frame-host" aria-label={`Área do frame ${titulo}`} />;
}
