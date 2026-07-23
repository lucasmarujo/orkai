import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react';

import type { CanvasNode, Vec2 } from '../ipc/types';
import { NodeFrame } from '../nodes/NodeFrame';
import { nodeRegistry } from '../nodes/registry';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { CanvasBackground } from './CanvasBackground';
import { EdgeLayer, edgeAt } from './EdgeLayer';
import { Minimap } from './Minimap';
import { alvoEhFundo } from './pointerTarget';
import { nodesInRect, rectFromPoints } from './selection';
import type { Guide, Rect } from './snapping';
import { useKeyboard } from './useKeyboard';
import { panBy, screenToWorld, worldToScreen, zoomAt } from './viewport';
import { visibleNodes } from './virtualization';

/** Sensibilidade da roda. Negativo porque `deltaY` cresce ao afastar. */
const WHEEL_SENSITIVITY = -0.0015;

/** Abaixo disso o gesto conta como clique, nao como arrasto. */
const CLIQUE_MAX_PX = 4;

export function Canvas() {
  const { nodes, connections, viewport, selectedIds, setViewport, setSelection, connect } =
    useWorkspaceStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [tela, setTela] = useState({ width: 0, height: 0 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquise, setMarquise] = useState<Rect | null>(null);
  const [conexaoPendente, setConexaoPendente] = useState<{ from: Vec2; to: Vec2 } | null>(null);
  const [arestaSobCursor, setArestaSobCursor] = useState<string | null>(null);

  useKeyboard(tela);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entrada]) => {
      if (!entrada) return;
      setTela({ width: entrada.contentRect.width, height: entrada.contentRect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const pontoLocal = useCallback((clientX: number, clientY: number): Vec2 => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);

  const aoRolar = useCallback(
    (evento: WheelEvent<HTMLDivElement>) => {
      const ancora = pontoLocal(evento.clientX, evento.clientY);
      setViewport(zoomAt(viewport, ancora, Math.exp(evento.deltaY * WHEEL_SENSITIVITY)));
    },
    [pontoLocal, setViewport, viewport],
  );

  /** Segue o ponteiro no container ate soltar. */
  const capturar = useCallback(
    (
      evento: PointerEvent<HTMLDivElement>,
      aMover: (e: globalThis.PointerEvent) => void,
      aoSoltar: (e: globalThis.PointerEvent) => void,
    ) => {
      const alvo = evento.currentTarget;
      alvo.setPointerCapture(evento.pointerId);
      const soltar = (e: globalThis.PointerEvent) => {
        alvo.removeEventListener('pointermove', aMover);
        alvo.removeEventListener('pointerup', soltar);
        alvo.removeEventListener('pointercancel', soltar);
        aoSoltar(e);
      };
      alvo.addEventListener('pointermove', aMover);
      alvo.addEventListener('pointerup', soltar);
      alvo.addEventListener('pointercancel', soltar);
    },
    [],
  );

  const iniciarPan = useCallback(
    (evento: PointerEvent<HTMLDivElement>) => {
      let anterior = { x: evento.clientX, y: evento.clientY };
      const inicio = { x: evento.clientX, y: evento.clientY };
      evento.currentTarget.classList.add('canvas--arrastando');

      capturar(
        evento,
        (e) => {
          const delta = { x: e.clientX - anterior.x, y: e.clientY - anterior.y };
          anterior = { x: e.clientX, y: e.clientY };
          setViewport(panBy(useWorkspaceStore.getState().viewport, delta));
        },
        (e) => {
          containerRef.current?.classList.remove('canvas--arrastando');
          // Sem arrasto, foi clique no vazio: limpa a selecao. Com arrasto, nao —
          // senao mover o canvas desfaria a selecao sem querer.
          const percorreu = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y);
          if (percorreu < CLIQUE_MAX_PX) setSelection(new Set());
        },
      );
    },
    [capturar, setSelection, setViewport],
  );

  const iniciarMarquise = useCallback(
    (evento: PointerEvent<HTMLDivElement>) => {
      const inicio = screenToWorld(viewport, pontoLocal(evento.clientX, evento.clientY));
      // Ctrl soma a marquise a selecao atual; Shift sozinho comeca uma nova.
      const base = evento.ctrlKey ? new Set(useWorkspaceStore.getState().selectedIds) : new Set<string>();

      capturar(
        evento,
        (e) => {
          const atual = screenToWorld(
            useWorkspaceStore.getState().viewport,
            pontoLocal(e.clientX, e.clientY),
          );
          const rect = rectFromPoints(inicio, atual);
          setMarquise(rect);
          const dentro = nodesInRect(useWorkspaceStore.getState().nodes, rect);
          setSelection(new Set([...base, ...dentro]));
        },
        () => setMarquise(null),
      );
    },
    [capturar, pontoLocal, setSelection, viewport],
  );

  const aoPressionar = useCallback(
    (evento: PointerEvent<HTMLDivElement>) => {
      const noVazio = alvoEhFundo(evento.target);

      if (evento.button === 1) {
        iniciarPan(evento);
        return;
      }
      if (evento.button !== 0 || !noVazio) return;

      // Clique no vazio pode ser numa aresta: ela e pintada no canvas, sem hit-test do DOM.
      const local = pontoLocal(evento.clientX, evento.clientY);
      const aresta = edgeAt(local, nodes, connections, viewport);
      if (aresta) {
        void useWorkspaceStore.getState().disconnect(aresta);
        return;
      }

      // Arrastar no vazio move o canvas — e o gesto que a mao espera. A marquise fica
      // atras de Shift/Ctrl, que e o modificador que ja significa "selecionar" no app.
      if (evento.shiftKey || evento.ctrlKey) {
        iniciarMarquise(evento);
      } else {
        iniciarPan(evento);
      }
    },
    [connections, iniciarMarquise, iniciarPan, nodes, pontoLocal, viewport],
  );

  const aoMover = useCallback(
    (evento: PointerEvent<HTMLDivElement>) => {
      if (marquise || conexaoPendente) return;
      const local = pontoLocal(evento.clientX, evento.clientY);
      setArestaSobCursor(edgeAt(local, nodes, connections, viewport));
    },
    [conexaoPendente, connections, marquise, nodes, pontoLocal, viewport],
  );

  const iniciarConexao = useCallback(
    (from: CanvasNode, evento: PointerEvent<HTMLElement>) => {
      const origem: Vec2 = {
        x: from.position.x + from.size.width,
        y: from.position.y + from.size.height / 2,
      };
      const alvo = evento.currentTarget;
      alvo.setPointerCapture(evento.pointerId);

      const aMover = (e: globalThis.PointerEvent) => {
        const store = useWorkspaceStore.getState();
        setConexaoPendente({
          from: origem,
          to: screenToWorld(store.viewport, pontoLocal(e.clientX, e.clientY)),
        });
      };

      const soltar = (e: globalThis.PointerEvent) => {
        alvo.removeEventListener('pointermove', aMover);
        alvo.removeEventListener('pointerup', soltar);
        setConexaoPendente(null);

        // Quem esta sob o cursor: o ponteiro esta capturado, entao o alvo do evento
        // e sempre o handle — `elementFromPoint` e o jeito de achar o no de baixo.
        const sob = document.elementFromPoint(e.clientX, e.clientY);
        const destino = sob?.closest('[data-node-id]')?.getAttribute('data-node-id');
        if (destino && destino !== from.id) {
          void connect(from.id, destino);
        }
      };

      alvo.addEventListener('pointermove', aMover);
      alvo.addEventListener('pointerup', soltar);
    },
    [connect, pontoLocal],
  );

  const irPara = useCallback(
    (centroMundo: Vec2) => {
      setViewport({
        ...viewport,
        pan: {
          x: centroMundo.x - tela.width / (2 * viewport.zoom),
          y: centroMundo.y - tela.height / (2 * viewport.zoom),
        },
      });
    },
    [setViewport, tela.height, tela.width, viewport],
  );

  const visiveis = visibleNodes(nodes, viewport, tela.width, tela.height);

  return (
    <div
      ref={containerRef}
      className={`canvas ${arestaSobCursor ? 'canvas--sobre-aresta' : ''}`}
      onWheel={aoRolar}
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      data-testid="canvas"
    >
      <CanvasBackground viewport={viewport} />
      <EdgeLayer
        nodes={nodes}
        connections={connections}
        viewport={viewport}
        guides={guides}
        pendente={conexaoPendente}
        hoveredId={arestaSobCursor}
      />

      <div
        className="canvas__nodes"
        style={{
          transform: `scale(${viewport.zoom}) translate3d(${-viewport.pan.x}px, ${-viewport.pan.y}px, 0)`,
        }}
      >
        {visiveis.map((node) => {
          const definicao = nodeRegistry[node.kind.type];
          const Componente = definicao.component;
          return (
            <NodeFrame
              key={node.id}
              node={node}
              viewport={viewport}
              title={definicao.title(node)}
              selected={selectedIds.has(node.id)}
              onGuides={setGuides}
              onStartConnection={iniciarConexao}
            >
              <Componente node={node} />
            </NodeFrame>
          );
        })}
      </div>

      {marquise && (
        <div
          className="canvas__marquise"
          style={{
            left: worldToScreen(viewport, { x: marquise.x, y: marquise.y }).x,
            top: worldToScreen(viewport, { x: marquise.x, y: marquise.y }).y,
            width: marquise.width * viewport.zoom,
            height: marquise.height * viewport.zoom,
          }}
        />
      )}

      <Minimap nodes={nodes} viewport={viewport} screen={tela} onJump={irPara} />

      <span className="canvas__hud">
        {Math.round(viewport.zoom * 100)}% · {visiveis.length}/{nodes.length} nós
        {selectedIds.size > 0 && ` · ${selectedIds.size} selecionado(s)`}
      </span>
    </div>
  );
}
