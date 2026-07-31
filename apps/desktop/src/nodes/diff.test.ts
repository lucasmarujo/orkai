import { describe, expect, it } from 'vitest';

import { parseDiff } from './diff';

const tipos = (texto: string) => parseDiff(texto).map((l) => l.tipo);

describe('parseDiff', () => {
  it('classifica adição, remoção, hunk e contexto', () => {
    const diff = ['@@ -1,3 +1,3 @@', ' contexto', '-antigo', '+novo'].join('\n');
    expect(tipos(diff)).toEqual(['hunk', 'ctx', 'del', 'add']);
  });

  it('trata +++ e --- como metadado, não como adição e remoção', () => {
    // Regressão: os dois começam com + e -, e pintá-los de verde/vermelho é o
    // erro clássico — o cabeçalho apareceria como se fosse mudança de conteúdo.
    expect(tipos('--- a/lib.rs\n+++ b/lib.rs')).toEqual(['meta', 'meta']);
  });

  it('marca as linhas de cabeçalho do git como metadado', () => {
    const cabecalho = ['diff --git a/x b/x', 'index 1234..5678 100644', '\\ No newline at end'];
    expect(tipos(cabecalho.join('\n'))).toEqual(['meta', 'meta', 'meta']);
  });

  it('preserva o texto original de cada linha', () => {
    expect(parseDiff('+const a = 1')[0]).toEqual({ tipo: 'add', texto: '+const a = 1' });
  });

  it('devolve lista vazia para diff vazio', () => {
    expect(parseDiff('')).toEqual([]);
  });
});
