/**
 * Leitura de diff unificado para exibição.
 *
 * Classifica linha a linha e devolve texto, nunca HTML: o `GitNode` renderiza um
 * `<span>` por linha com a classe do tipo. Conteúdo de arquivo assim não tem
 * caminho para virar markup, e não precisa passar por sanitização.
 */

export type LinhaTipo = 'add' | 'del' | 'hunk' | 'meta' | 'ctx';

export interface LinhaDiff {
  tipo: LinhaTipo;
  texto: string;
}

export function parseDiff(texto: string): LinhaDiff[] {
  if (!texto) return [];
  return texto.split('\n').map((linha) => ({ tipo: classificar(linha), texto: linha }));
}

function classificar(linha: string): LinhaTipo {
  // Cabeçalho antes de adição/remoção: `+++` e `---` começam com `+`/`-` mas são
  // metadados, e pintá-los de verde/vermelho é o erro clássico de leitor de diff.
  if (linha.startsWith('+++') || linha.startsWith('---')) return 'meta';
  if (linha.startsWith('@@')) return 'hunk';
  if (linha.startsWith('+')) return 'add';
  if (linha.startsWith('-')) return 'del';
  if (linha.startsWith('diff ') || linha.startsWith('index ') || linha.startsWith('\\')) {
    return 'meta';
  }
  return 'ctx';
}
