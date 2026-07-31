import { useEffect } from 'react';

import { ZOOM_MAX, ZOOM_MIN, type Viewport } from '../ipc/types';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { boundingBox } from './selection';

/** Atalhos globais do canvas. Teclado-primeiro, como pede o documento de visao. */
export function useKeyboard(screen: { width: number; height: number }, onPalette?: () => void) {
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      // Nao sequestrar teclas de quem esta digitando num terminal ou editor.
      const alvo = evento.target as HTMLElement | null;
      const digitando =
        alvo?.tagName === 'TEXTAREA' ||
        alvo?.tagName === 'INPUT' ||
        alvo?.isContentEditable === true ||
        alvo?.closest('.terminal-host') !== null;

      const store = useWorkspaceStore.getState();
      const ctrl = evento.ctrlKey || evento.metaKey;

      // Antes da guarda de digitacao: o caso comum e o foco estar num terminal, e e
      // exatamente ai que achar um no do outro lado do canvas mais vale a pena.
      if (ctrl && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        onPalette?.();
        return;
      }

      // Undo/redo valem mesmo com foco no editor de nota: e o gesto esperado.
      if (ctrl && evento.key.toLowerCase() === 'z' && !digitando) {
        evento.preventDefault();
        void (evento.shiftKey ? store.redo() : store.undo());
        return;
      }
      if (ctrl && evento.key.toLowerCase() === 'y' && !digitando) {
        evento.preventDefault();
        void store.redo();
        return;
      }

      if (digitando) return;

      if (ctrl && evento.key.toLowerCase() === 'a') {
        evento.preventDefault();
        store.selectAll();
        return;
      }

      if (evento.key === 'Delete' || evento.key === 'Backspace') {
        evento.preventDefault();
        void store.deleteSelected();
        return;
      }

      if (evento.key === 'Escape') {
        store.setSelection(new Set());
        return;
      }

      if (ctrl && evento.key === '0') {
        evento.preventDefault();
        store.setViewport({ pan: store.viewport.pan, zoom: 1 });
        return;
      }

      if (ctrl && evento.key === '1') {
        evento.preventDefault();
        store.setViewport(enquadrarTudo(store.nodes, screen) ?? store.viewport);
      }
    };

    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onPalette, screen]);
}

/** Viewport que cabe todos os nos com uma folga de 10%. */
export function enquadrarTudo(
  nodes: Parameters<typeof boundingBox>[0],
  screen: { width: number; height: number },
): Viewport | null {
  const caixa = boundingBox(nodes);
  if (!caixa || screen.width === 0 || screen.height === 0) return null;

  const zoom = Math.min(
    ZOOM_MAX,
    Math.max(
      ZOOM_MIN,
      Math.min(screen.width / (caixa.width * 1.1), screen.height / (caixa.height * 1.1)),
    ),
  );
  return {
    zoom,
    pan: {
      x: caixa.x + caixa.width / 2 - screen.width / (2 * zoom),
      y: caixa.y + caixa.height / 2 - screen.height / (2 * zoom),
    },
  };
}
