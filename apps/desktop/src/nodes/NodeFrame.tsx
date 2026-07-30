import { useCallback, type PointerEvent, type ReactNode } from 'react';

import { CURSOR, HANDLES, resizeRect, type Handle } from '../canvas/resize';
import { nodesToDrag, toggleSelection } from '../canvas/selection';
import {
  GRID,
  SNAP_THRESHOLD_PX,
  alignmentGuides,
  rectOf,
  snapToGrid,
  type Guide,
} from '../canvas/snapping';
import type { CanvasNode, Vec2, Viewport } from '../ipc/types';
import { useWorkspaceStore } from '../stores/workspaceStore';

interface Props {
  node: CanvasNode;
  viewport: Viewport;
  title: string;
  selected: boolean;
  onGuides: (guides: Guide[]) => void;
  onStartConnection: (from: CanvasNode, evento: PointerEvent<HTMLElement>) => void;
  children: ReactNode;
}

/** Segue o ponteiro ate soltar, e limpa os listeners sozinho. */
function arrastar(
  evento: PointerEvent<HTMLElement>,
  aMover: (e: globalThis.PointerEvent) => void,
  aoSoltar: () => void,
) {
  const alvo = evento.currentTarget;
  alvo.setPointerCapture(evento.pointerId);
  const soltar = () => {
    alvo.removeEventListener('pointermove', aMover);
    alvo.removeEventListener('pointerup', soltar);
    alvo.removeEventListener('pointercancel', soltar);
    aoSoltar();
  };
  alvo.addEventListener('pointermove', aMover);
  alvo.addEventListener('pointerup', soltar);
  alvo.addEventListener('pointercancel', soltar);
}

/**
 * Moldura comum a todos os nos: titulo, arrastar, redimensionar, conectar e fechar.
 *
 * O arrasto move a selecao inteira e o conteudo dos frames selecionados; a persistencia
 * acontece uma vez no `pointerup`, virando um passo unico de undo.
 */
export function NodeFrame({
  node,
  viewport,
  title,
  selected,
  onGuides,
  onStartConnection,
  children,
}: Props) {
  const selecionar = useCallback(
    (evento: PointerEvent<HTMLElement>) => {
      const store = useWorkspaceStore.getState();
      const aditivo = evento.shiftKey || evento.ctrlKey;
      store.setSelection(toggleSelection(store.selectedIds, node.id, aditivo));
    },
    [node.id],
  );

  const iniciarMover = useCallback(
    (evento: PointerEvent<HTMLElement>) => {
      if (evento.button !== 0) return;
      evento.stopPropagation();
      selecionar(evento);

      const store = useWorkspaceStore.getState();
      const alvos = nodesToDrag(store.nodes, store.selectedIds);
      const before = store.nodes.filter((n) => alvos.has(n.id));
      const origens = new Map(before.map((n) => [n.id, n.position]));
      const outros = store.nodes.filter((n) => !alvos.has(n.id)).map(rectOf);
      const inicio = { x: evento.clientX, y: evento.clientY };

      const aMover = (e: globalThis.PointerEvent) => {
        const bruto: Vec2 = {
          x: (e.clientX - inicio.x) / viewport.zoom,
          y: (e.clientY - inicio.y) / viewport.zoom,
        };

        // Alt desliga o ima: as vezes o usuario quer a posicao exata.
        let ajuste = { x: 0, y: 0 };
        let guides: Guide[] = [];
        if (!e.altKey) {
          const arrastado = origens.get(node.id) ?? node.position;
          const previsto = {
            ...rectOf(node),
            x: arrastado.x + bruto.x,
            y: arrastado.y + bruto.y,
          };
          const alinhamento = alignmentGuides(previsto, outros, SNAP_THRESHOLD_PX / viewport.zoom);
          guides = alinhamento.guides;
          ajuste = alinhamento.delta;

          // Sem nada para alinhar, cai no grid — assim nunca fica "quase" alinhado.
          const gridado = snapToGrid({ x: previsto.x, y: previsto.y }, GRID);
          if (ajuste.x === 0) ajuste.x = gridado.x - previsto.x;
          if (ajuste.y === 0) ajuste.y = gridado.y - previsto.y;
        }

        const updates = new Map(
          [...origens].map(([id, origem]) => [
            id,
            {
              position: {
                x: origem.x + bruto.x + ajuste.x,
                y: origem.y + bruto.y + ajuste.y,
              },
            },
          ]),
        );
        useWorkspaceStore.getState().previewNodes(updates);
        onGuides(guides);
      };

      arrastar(evento, aMover, () => {
        onGuides([]);
        void useWorkspaceStore.getState().commitGesture(before);
      });
    },
    [node, onGuides, selecionar, viewport.zoom],
  );

  const iniciarRedimensionar = useCallback(
    (evento: PointerEvent<HTMLElement>, handle: Handle) => {
      evento.stopPropagation();
      const before = [node];
      const origem = { position: node.position, size: node.size };
      const inicio = { x: evento.clientX, y: evento.clientY };

      const aMover = (e: globalThis.PointerEvent) => {
        const delta = {
          x: (e.clientX - inicio.x) / viewport.zoom,
          y: (e.clientY - inicio.y) / viewport.zoom,
        };
        const patch = resizeRect(origem.position, origem.size, handle, delta);
        useWorkspaceStore.getState().previewNodes(new Map([[node.id, patch]]));
      };

      arrastar(evento, aMover, () => {
        void useWorkspaceStore.getState().commitGesture(before);
      });
    },
    [node, viewport.zoom],
  );

  const ehFrame = node.kind.type === 'frame';

  return (
    <article
      // Usado pelo drop da conexao para descobrir o no sob o cursor.
      data-node-id={node.id}
      className={`node ${selected ? 'node--selected' : ''} ${ehFrame ? 'node--frame' : ''}`}
      style={{
        transform: `translate3d(${node.position.x}px, ${node.position.y}px, 0)`,
        width: node.size.width,
        height: node.size.height,
        zIndex: node.zIndex,
      }}
      onPointerDown={selecionar}
    >
      <header className="node__header" onPointerDown={iniciarMover}>
        <span className="node__title">{title}</span>
        <button
          type="button"
          className="node__close"
          aria-label={`Fechar ${title}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            const store = useWorkspaceStore.getState();
            store.setSelection(new Set([node.id]));
            void store.deleteSelected();
          }}
        >
          ×
        </button>
      </header>

      <div className="node__body">{children}</div>

      <button
        type="button"
        className="node__port"
        aria-label={`Conectar a partir de ${title}`}
        title="Arraste até outro nó para conectar"
        onPointerDown={(evento) => {
          evento.stopPropagation();
          onStartConnection(node, evento);
        }}
      >
        +
      </button>

      {/* Uma alça por borda e por canto: redimensiona de qualquer lado. */}
      {HANDLES.map((h) => (
        <div
          key={h}
          className={`node__resize node__resize--${h}`}
          role="separator"
          aria-label={`Redimensionar ${title} pela borda ${h}`}
          style={{ cursor: CURSOR[h] }}
          onPointerDown={(e) => iniciarRedimensionar(e, h)}
        />
      ))}
    </article>
  );
}
