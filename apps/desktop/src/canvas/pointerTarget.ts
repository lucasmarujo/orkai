/**
 * Decide se um ponteiro caiu no fundo do canvas.
 *
 * Comparar `event.target === event.currentTarget` nao serve: as camadas de grid e de
 * arestas sao `<canvas>` com `inset: 0`, entao elas — e nao o container — sao o alvo
 * de qualquer clique em area vazia. Perguntar pelos ancestrais e o que descreve a
 * intencao de verdade.
 */

/** Elementos que tem gesto proprio e nao devem virar pan nem marquise. */
const INTERATIVOS = '.node, .minimap, .toolbar';

export function alvoEhFundo(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof Element)) return false;
  return alvo.closest(INTERATIVOS) === null;
}
