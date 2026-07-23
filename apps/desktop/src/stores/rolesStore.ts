import { create } from 'zustand';

import { type AgentRole } from '../agents/profiles';
import * as api from '../ipc/commands';

/**
 * Roles dos agentes: as embutidas mais as que o usuário cria.
 *
 * As customizadas são persistidas como JSON num setting do backend — o Rust só guarda o
 * blob, o formato é daqui. Built-in e customizada convivem; a UI marca quais dá para
 * editar/excluir (só as customizadas).
 */

function slug(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  // Rótulos só com acentos/símbolos zeram o slug; o id por tempo garante unicidade.
  return base || `role-${Date.now()}`;
}

interface RolesState {
  /**
   * Roles criadas pelo usuário. Os componentes juntam com `BUILTIN_ROLES` via `useMemo`
   * — um seletor que devolvesse a lista concatenada criaria um array novo a cada
   * render, e o Zustand leria isso como mudança de estado: re-render infinito.
   */
  custom: AgentRole[];
  load: () => Promise<void>;
  /** Cria ou atualiza (por id) uma role customizada e persiste. */
  upsert: (role: { id?: string; label: string; systemPrompt: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useRoles = create<RolesState>((set, get) => {
  const persist = (custom: AgentRole[]) => {
    set({ custom });
    void api.rolesSave(JSON.stringify(custom));
  };

  return {
    custom: [],

    load: async () => {
      try {
        const parsed = JSON.parse(await api.rolesLoad());
        // Só aceita entradas com o shape certo; ignora lixo sem derrubar a UI.
        const custom: AgentRole[] = Array.isArray(parsed)
          ? parsed.filter(
              (r): r is AgentRole =>
                r && typeof r.id === 'string' && typeof r.label === 'string',
            )
          : [];
        set({ custom });
      } catch {
        set({ custom: [] });
      }
    },

    upsert: async ({ id, label, systemPrompt }) => {
      const nome = label.trim();
      if (!nome) return;
      const alvo = id ?? slug(nome);
      const semAlvo = get().custom.filter((r) => r.id !== alvo);
      persist([...semAlvo, { id: alvo, label: nome, systemPrompt }]);
    },

    remove: async (id) => {
      persist(get().custom.filter((r) => r.id !== id));
    },
  };
});
