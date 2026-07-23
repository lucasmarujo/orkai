import { useCallback, useMemo, type PointerEvent } from 'react';

import type { CanvasNode, Vec2, Viewport } from '../ipc/types';
import { boundingBox } from './selection';
import { visibleWorldRect } from './viewport';

const LARGURA = 200;
const ALTURA = 140;
const MARGEM = 0.1;

interface Props {
  nodes: CanvasNode[];
  viewport: Viewport;
  screen: { width: number; height: number };
  onJump: (centroMundo: Vec2) => void;
}

/**
 * Visao geral do workspace. Em DOM, nao em canvas: sao alguns retangulos, e um `div`
 * por no evita mais uma superficie de desenho para manter em sincronia.
 */
export function Minimap({ nodes, viewport, screen, onJump }: Props) {
  const mundo = useMemo(() => {
    const caixa = boundingBox(nodes);
    const visivel = visibleWorldRect(viewport, screen.width, screen.height);
    const alvo = caixa ?? {
      x: visivel.minX,
      y: visivel.minY,
      width: visivel.maxX - visivel.minX,
      height: visivel.maxY - visivel.minY,
    };

    // O retangulo do viewport tambem entra no enquadramento, senao ele sai do minimapa
    // quando a camera esta longe de qualquer no.
    const x = Math.min(alvo.x, visivel.minX);
    const y = Math.min(alvo.y, visivel.minY);
    const width = Math.max(alvo.x + alvo.width, visivel.maxX) - x;
    const height = Math.max(alvo.y + alvo.height, visivel.maxY) - y;
    const folga = Math.max(width, height) * MARGEM;

    return {
      x: x - folga,
      y: y - folga,
      width: Math.max(width + folga * 2, 1),
      height: Math.max(height + folga * 2, 1),
    };
  }, [nodes, viewport, screen.width, screen.height]);

  const escala = Math.min(LARGURA / mundo.width, ALTURA / mundo.height);
  const paraMinimapa = useCallback(
    (x: number, y: number) => ({ x: (x - mundo.x) * escala, y: (y - mundo.y) * escala }),
    [escala, mundo.x, mundo.y],
  );

  const visivel = visibleWorldRect(viewport, screen.width, screen.height);
  const cameraPos = paraMinimapa(visivel.minX, visivel.minY);

  const aoClicar = useCallback(
    (evento: PointerEvent<HTMLDivElement>) => {
      const rect = evento.currentTarget.getBoundingClientRect();
      onJump({
        x: mundo.x + (evento.clientX - rect.left) / escala,
        y: mundo.y + (evento.clientY - rect.top) / escala,
      });
    },
    [escala, mundo.x, mundo.y, onJump],
  );

  return (
    <div
      className="minimap"
      style={{ width: LARGURA, height: ALTURA }}
      onPointerDown={aoClicar}
      role="button"
      tabIndex={-1}
      aria-label="Minimapa: clique para navegar"
    >
      {nodes.map((node) => {
        const pos = paraMinimapa(node.position.x, node.position.y);
        return (
          <span
            key={node.id}
            className={`minimap__node minimap__node--${node.kind.type}`}
            style={{
              left: pos.x,
              top: pos.y,
              width: Math.max(2, node.size.width * escala),
              height: Math.max(2, node.size.height * escala),
            }}
          />
        );
      })}

      <span
        className="minimap__camera"
        style={{
          left: cameraPos.x,
          top: cameraPos.y,
          width: (visivel.maxX - visivel.minX) * escala,
          height: (visivel.maxY - visivel.minY) * escala,
        }}
      />
    </div>
  );
}
