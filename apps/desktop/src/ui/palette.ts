/**
 * Filtro e ranking do command palette.
 *
 * Só as fontes locais passam por aqui — nós, ações e prompts já estão em memória, e
 * filtrar `Array` é mais barato do que indexá-los. Resultado de arquivo vem do FTS5
 * no backend já ranqueado por BM25 e entra na lista sem passar por `filtrar`.
 */

export type ResultadoTipo = 'acao' | 'no' | 'arquivo' | 'prompt';

export interface Resultado {
  tipo: ResultadoTipo;
  id: string;
  titulo: string;
  detalhe: string;
  executar: () => void | Promise<void>;
}

/** Empate no texto desempata pelo que costuma ser a intenção de quem digitou. */
const PESO_TIPO: Record<ResultadoTipo, number> = {
  acao: 0,
  no: 1,
  prompt: 2,
  arquivo: 3,
};

/**
 * Minúsculo e sem acento. Casa com o `remove_diacritics 2` do tokenizer do FTS5:
 * as duas metades da busca precisam normalizar igual, ou "sessao" acha no arquivo e
 * não acha no título do nó.
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Menor é melhor; `null` quando não casa. */
function pontuar(titulo: string, termo: string): number | null {
  const alvo = normalizar(titulo);
  if (alvo.startsWith(termo)) return 0;
  if (alvo.split(/[\s/\\._-]+/).some((palavra) => palavra.startsWith(termo))) return 1;
  if (alvo.includes(termo)) return 2;
  return null;
}

/** Filtra por título e ordena por relevância. Termo vazio devolve tudo, na ordem dada. */
export function filtrar(fontes: Resultado[], termo: string): Resultado[] {
  const alvo = normalizar(termo.trim());
  if (!alvo) return fontes;

  return fontes
    .flatMap((item) => {
      const nota = pontuar(item.titulo, alvo);
      return nota === null ? [] : [{ item, nota }];
    })
    .sort((a, b) => a.nota - b.nota || PESO_TIPO[a.item.tipo] - PESO_TIPO[b.item.tipo])
    .map(({ item }) => item);
}
