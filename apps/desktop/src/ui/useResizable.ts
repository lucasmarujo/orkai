import { useCallback, useState, type PointerEvent } from 'react';

/**
 * Largura ajustável por arrasto, para as sidebars.
 *
 * A preferência é por-dispositivo (como o tema), então mora no localStorage e não no
 * banco — não faz sentido sincronizar largura de painel entre máquinas.
 */

export const LARGURA_MIN = 160;
export const LARGURA_MAX = 560;

/**
 * Largura resultante de um arrasto, já limitada.
 *
 * `side` é a borda do app em que o painel está: a sidebar da esquerda cresce quando o
 * mouse vai para a direita; a da direita, ao contrário.
 */
export function nextWidth(
  startWidth: number,
  deltaX: number,
  side: 'left' | 'right',
  min = LARGURA_MIN,
  max = LARGURA_MAX,
): number {
  const bruto = side === 'left' ? startWidth + deltaX : startWidth - deltaX;
  if (!Number.isFinite(bruto)) return startWidth;
  return Math.min(max, Math.max(min, Math.round(bruto)));
}

export function useResizable(chave: string, padrao: number, side: 'left' | 'right') {
  const [width, setWidth] = useState(() => {
    const salvo = Number(localStorage.getItem(chave));
    return Number.isFinite(salvo) && salvo > 0 ? nextWidth(salvo, 0, side) : padrao;
  });

  const onResizeStart = useCallback(
    (evento: PointerEvent<HTMLElement>) => {
      if (evento.button !== 0) return;
      evento.preventDefault();

      const alvo = evento.currentTarget;
      alvo.setPointerCapture(evento.pointerId);
      const inicioX = evento.clientX;
      const inicial = width;
      document.body.classList.add('is-resizing');

      const mover = (e: globalThis.PointerEvent) => {
        setWidth(nextWidth(inicial, e.clientX - inicioX, side));
      };
      const soltar = () => {
        alvo.removeEventListener('pointermove', mover);
        alvo.removeEventListener('pointerup', soltar);
        alvo.removeEventListener('pointercancel', soltar);
        document.body.classList.remove('is-resizing');
        // Persiste no fim do gesto, não a cada pixel.
        setWidth((atual) => {
          localStorage.setItem(chave, String(atual));
          return atual;
        });
      };

      alvo.addEventListener('pointermove', mover);
      alvo.addEventListener('pointerup', soltar);
      alvo.addEventListener('pointercancel', soltar);
    },
    [chave, side, width],
  );

  return { width, onResizeStart };
}
