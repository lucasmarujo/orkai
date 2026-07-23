/**
 * Agenda uma acao por chave, cancelando a anterior.
 *
 * Arrastar um no dispara dezenas de eventos por segundo; sem isto o SQLite recebe
 * uma escrita por frame.
 */
export function createDebouncer(delayMs: number) {
  const pendentes = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    schedule(key: string, acao: () => void) {
      const anterior = pendentes.get(key);
      if (anterior !== undefined) clearTimeout(anterior);
      pendentes.set(
        key,
        setTimeout(() => {
          pendentes.delete(key);
          acao();
        }, delayMs),
      );
    },

    /** Executa imediatamente o que estiver pendente. Usado ao fechar a janela. */
    cancel(key: string) {
      const pendente = pendentes.get(key);
      if (pendente !== undefined) {
        clearTimeout(pendente);
        pendentes.delete(key);
      }
    },
  };
}
