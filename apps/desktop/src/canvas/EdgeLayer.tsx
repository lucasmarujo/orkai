import { useEffect, useRef } from 'react';

import type { CanvasNode, Connection, Vec2, Viewport } from '../ipc/types';
import type { Guide } from './snapping';
import { worldToScreen } from './viewport';

/**
 * Arestas e guias de alinhamento, em canvas 2D.
 *
 * ponytail: bezier no Canvas2D em vez de WebGL. Rasterizacao e na CPU, mas a camada
 * e composta pela GPU e algumas centenas de curvas por frame nao aparecem no perfil.
 * Se o benchmark de 1000 nos acusar, o upgrade e mover para a camada WebGL do grid
 * com quads instanciados — ver ADR-001.
 */

const COR_ARESTA = '#4c8dff';
const COR_ARESTA_HOVER = '#8ab4ff';
const COR_GUIA = '#ff6ac1';
const LARGURA_ARESTA = 2;

/** Distancia em pixels para o clique acertar uma aresta. */
export const EDGE_HIT_PX = 6;

interface Props {
  nodes: CanvasNode[];
  connections: Connection[];
  viewport: Viewport;
  guides: Guide[];
  /** Aresta em construcao: da origem ate o cursor. */
  pendente: { from: Vec2; to: Vec2 } | null;
  hoveredId: string | null;
}

/** Ponto de ancoragem: centro da borda direita da origem, esquerda do destino. */
function ancoras(from: CanvasNode, to: CanvasNode): [Vec2, Vec2] {
  return [
    { x: from.position.x + from.size.width, y: from.position.y + from.size.height / 2 },
    { x: to.position.x, y: to.position.y + to.size.height / 2 },
  ];
}

/** Controle horizontal proporcional a distancia, como em editores de fluxo. */
function controle(a: Vec2, b: Vec2): number {
  return Math.max(40, Math.min(220, Math.abs(b.x - a.x) * 0.5));
}

function tracarCurva(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2) {
  const c = controle(a, b);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.bezierCurveTo(a.x + c, a.y, b.x - c, b.y, b.x, b.y);
}

export function EdgeLayer({ nodes, connections, viewport, guides, pendente, hoveredId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const largura = Math.round(canvas.clientWidth * dpr);
    const altura = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== largura || canvas.height !== altura) {
      canvas.width = largura;
      canvas.height = altura;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    const porId = new Map(nodes.map((n) => [n.id, n]));

    for (const conexao of connections) {
      const from = porId.get(conexao.from);
      const to = porId.get(conexao.to);
      // Nó fora da tela foi virtualizado do DOM, mas continua no store — a aresta
      // segue sendo desenhada, senao ela sumiria ao dar zoom out.
      if (!from || !to) continue;

      const [a, b] = ancoras(from, to);
      const destaque = conexao.id === hoveredId;
      tracarCurva(ctx, worldToScreen(viewport, a), worldToScreen(viewport, b));
      ctx.strokeStyle = destaque ? COR_ARESTA_HOVER : COR_ARESTA;
      ctx.lineWidth = (destaque ? LARGURA_ARESTA + 1.5 : LARGURA_ARESTA) * viewport.zoom;
      ctx.stroke();
    }

    if (pendente) {
      tracarCurva(
        ctx,
        worldToScreen(viewport, pendente.from),
        worldToScreen(viewport, pendente.to),
      );
      ctx.strokeStyle = COR_ARESTA_HOVER;
      ctx.lineWidth = LARGURA_ARESTA * viewport.zoom;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = COR_GUIA;
    ctx.lineWidth = 1;
    for (const guia of guides) {
      const inicio = worldToScreen(
        viewport,
        guia.axis === 'x' ? { x: guia.at, y: guia.from } : { x: guia.from, y: guia.at },
      );
      const fim = worldToScreen(
        viewport,
        guia.axis === 'x' ? { x: guia.at, y: guia.to } : { x: guia.to, y: guia.at },
      );
      ctx.beginPath();
      ctx.moveTo(Math.round(inicio.x) + 0.5, Math.round(inicio.y) + 0.5);
      ctx.lineTo(Math.round(fim.x) + 0.5, Math.round(fim.y) + 0.5);
      ctx.stroke();
    }
  }, [nodes, connections, viewport, guides, pendente, hoveredId]);

  return <canvas ref={canvasRef} className="edge-layer" />;
}

/**
 * Aresta sob o ponto de tela informado, se houver.
 *
 * Amostra a curva em segmentos: resolver a distancia analitica de uma bezier cubica
 * nao paga o custo para um teste de clique.
 */
export function edgeAt(
  ponto: Vec2,
  nodes: CanvasNode[],
  connections: Connection[],
  viewport: Viewport,
): string | null {
  const porId = new Map(nodes.map((n) => [n.id, n]));
  const limite = EDGE_HIT_PX;

  for (const conexao of connections) {
    const from = porId.get(conexao.from);
    const to = porId.get(conexao.to);
    if (!from || !to) continue;

    const [aMundo, bMundo] = ancoras(from, to);
    const a = worldToScreen(viewport, aMundo);
    const b = worldToScreen(viewport, bMundo);
    const c = controle(a, b);

    for (let i = 0; i <= 24; i += 1) {
      const t = i / 24;
      const u = 1 - t;
      const x =
        u * u * u * a.x + 3 * u * u * t * (a.x + c) + 3 * u * t * t * (b.x - c) + t * t * t * b.x;
      const y = u * u * u * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * b.y;
      if (Math.hypot(x - ponto.x, y - ponto.y) <= limite) return conexao.id;
    }
  }
  return null;
}
