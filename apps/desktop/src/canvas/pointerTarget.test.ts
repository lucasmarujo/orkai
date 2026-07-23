import { describe, expect, it } from 'vitest';

import { alvoEhFundo } from './pointerTarget';

/** Reproduz a arvore real do canvas: camadas cobrindo tudo, nós por cima. */
function montarCanvas() {
  document.body.innerHTML = `
    <div class="canvas">
      <canvas class="canvas-background"></canvas>
      <canvas class="edge-layer"></canvas>
      <div class="canvas__nodes">
        <article class="node" data-node-id="a">
          <header class="node__header"><span class="node__title">t</span></header>
          <div class="node__body"><div class="terminal-host"></div></div>
        </article>
      </div>
      <div class="minimap"><span class="minimap__node"></span></div>
    </div>
  `;
  const q = (sel: string) => document.querySelector(sel);
  return {
    container: q('.canvas'),
    grid: q('.canvas-background'),
    arestas: q('.edge-layer'),
    camadaNos: q('.canvas__nodes'),
    tituloDoNo: q('.node__title'),
    terminal: q('.terminal-host'),
    minimapaFilho: q('.minimap__node'),
  };
}

describe('alvoEhFundo', () => {
  it('aceita o proprio container', () => {
    expect(alvoEhFundo(montarCanvas().container)).toBe(true);
  });

  it('aceita as camadas que cobrem a area toda', () => {
    // Regressao: era aqui que o pan quebrava — o clique no vazio acerta o <canvas>
    // do grid, nunca o container.
    const { grid, arestas, camadaNos } = montarCanvas();
    expect(alvoEhFundo(grid)).toBe(true);
    expect(alvoEhFundo(arestas)).toBe(true);
    expect(alvoEhFundo(camadaNos)).toBe(true);
  });

  it('rejeita qualquer profundidade dentro de um no', () => {
    const { tituloDoNo, terminal } = montarCanvas();
    expect(alvoEhFundo(tituloDoNo)).toBe(false);
    expect(alvoEhFundo(terminal)).toBe(false);
  });

  it('rejeita o minimapa, que tem gesto proprio', () => {
    expect(alvoEhFundo(montarCanvas().minimapaFilho)).toBe(false);
  });

  it('rejeita alvo nulo ou nao-elemento', () => {
    expect(alvoEhFundo(null)).toBe(false);
    expect(alvoEhFundo(new EventTarget())).toBe(false);
  });
});
