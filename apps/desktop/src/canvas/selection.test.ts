import { describe, expect, it } from 'vitest';

import type { CanvasNode } from '../ipc/types';
import {
  boundingBox,
  nodesInRect,
  nodesInsideFrame,
  nodesToDrag,
  rectFromPoints,
  toggleSelection,
} from './selection';

function no(id: string, x: number, y: number, width = 100, height = 100): CanvasNode {
  return {
    id,
    kind: { type: 'markdown', filePath: 'a.md', color: '' },
    position: { x, y },
    size: { width, height },
    zIndex: 0,
    createdAt: 0,
  };
}

describe('rectFromPoints', () => {
  it('normaliza arrasto em qualquer direcao', () => {
    const esperado = { x: 10, y: 20, width: 90, height: 80 };
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 100, y: 100 })).toEqual(esperado);
    expect(rectFromPoints({ x: 100, y: 100 }, { x: 10, y: 20 })).toEqual(esperado);
  });

  it('arrasto de tamanho zero vira retangulo vazio', () => {
    expect(rectFromPoints({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({
      x: 5,
      y: 5,
      width: 0,
      height: 0,
    });
  });
});

describe('nodesInRect', () => {
  const nodes = [no('a', 0, 0), no('b', 500, 0), no('c', 50, 50)];

  it('pega quem a marquise toca, mesmo parcialmente', () => {
    expect(nodesInRect(nodes, { x: -10, y: -10, width: 70, height: 70 }).sort()).toEqual(['a', 'c']);
  });

  it('nao pega quem esta fora', () => {
    expect(nodesInRect(nodes, { x: 480, y: 0, width: 50, height: 50 })).toEqual(['b']);
  });

  it('retangulo vazio nao seleciona nada', () => {
    expect(nodesInRect(nodes, { x: 0, y: 0, width: 0, height: 0 })).toEqual([]);
  });
});

describe('toggleSelection', () => {
  it('clique simples substitui a selecao', () => {
    expect([...toggleSelection(new Set(['a', 'b']), 'c', false)]).toEqual(['c']);
  });

  it('clique em membro do grupo preserva o grupo, para nao quebrar o arrasto', () => {
    const atual = new Set(['a', 'b']);
    expect(toggleSelection(atual, 'a', false)).toBe(atual);
  });

  it('shift adiciona e remove', () => {
    expect([...toggleSelection(new Set(['a']), 'b', true)].sort()).toEqual(['a', 'b']);
    expect([...toggleSelection(new Set(['a', 'b']), 'a', true)]).toEqual(['b']);
  });

  it('nao muta o conjunto original', () => {
    const atual = new Set(['a']);
    toggleSelection(atual, 'b', true);
    expect([...atual]).toEqual(['a']);
  });
});

function frame(id: string, x: number, y: number, width: number, height: number): CanvasNode {
  return {
    id,
    kind: { type: 'frame', title: 'Grupo' },
    position: { x, y },
    size: { width, height },
    zIndex: -1,
    createdAt: 0,
  };
}

describe('nodesInsideFrame', () => {
  const nodes = [
    frame('f', 0, 0, 1000, 1000),
    no('dentro', 100, 100),
    no('cruzando', 950, 100), // 100 de largura: estoura a borda direita
    no('fora', 5000, 0),
    frame('aninhado', 50, 50, 200, 200),
  ];

  it('pega so quem cabe inteiro', () => {
    expect(nodesInsideFrame(nodes, 'f')).toEqual(['dentro']);
  });

  it('frame nao engole outro frame', () => {
    expect(nodesInsideFrame(nodes, 'f')).not.toContain('aninhado');
  });

  it('no comum e id inexistente nao contem nada', () => {
    expect(nodesInsideFrame(nodes, 'dentro')).toEqual([]);
    expect(nodesInsideFrame(nodes, 'nao-existe')).toEqual([]);
  });
});

describe('nodesToDrag', () => {
  const nodes = [frame('f', 0, 0, 1000, 1000), no('dentro', 100, 100), no('solto', 5000, 0)];

  it('arrastar o frame leva o conteudo junto', () => {
    expect([...nodesToDrag(nodes, new Set(['f']))].sort()).toEqual(['dentro', 'f']);
  });

  it('arrastar um no solto nao leva mais ninguem', () => {
    expect([...nodesToDrag(nodes, new Set(['solto']))]).toEqual(['solto']);
  });

  it('arrastar o conteudo nao move o frame', () => {
    expect([...nodesToDrag(nodes, new Set(['dentro']))]).toEqual(['dentro']);
  });

  it('nao duplica quando frame e conteudo estao ambos selecionados', () => {
    expect([...nodesToDrag(nodes, new Set(['f', 'dentro']))].sort()).toEqual(['dentro', 'f']);
  });
});

describe('boundingBox', () => {
  it('envolve todos os nos', () => {
    expect(boundingBox([no('a', 0, 0), no('b', 400, 200)])).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 300,
    });
  });

  it('devolve null sem nos', () => {
    expect(boundingBox([])).toBeNull();
  });

  it('lida com coordenadas negativas', () => {
    expect(boundingBox([no('a', -200, -100)])).toEqual({
      x: -200,
      y: -100,
      width: 100,
      height: 100,
    });
  });
});
