import { create } from 'zustand';

/**
 * Atividade dos agentes, por nó.
 *
 * É atividade honesta — status, turnos e tempo de sessão —, não custo em tokens. Contar
 * tokens de verdade exige o agente em modo de saída estruturada (`--output-format json`),
 * o que conflita com o modo interativo/TUI que usamos aqui. Fica para um M3b+.
 */

export type AgentStatus = 'running' | 'exited';

export interface AgentActivity {
  status: AgentStatus;
  /** Prompts submetidos (contagem de Enter). */
  turns: number;
  startedAt: number;
  exitCode: number | null;
}

interface ActivityState {
  byId: Record<string, AgentActivity>;
  /** Mensagens pendentes por nó, vindas do backend (polling no painel). */
  pending: Record<string, number>;
  register: (id: string) => void;
  markTurn: (id: string) => void;
  markExit: (id: string, code: number) => void;
  setPending: (pending: Record<string, number>) => void;
  unregister: (id: string) => void;
}

export const useAgentActivity = create<ActivityState>((set) => ({
  byId: {},
  pending: {},

  setPending: (pending) => set({ pending }),

  register: (id) =>
    set((estado) => {
      // Remontagem pela virtualização não deve zerar os turnos já contados.
      if (estado.byId[id]) {
        return { byId: { ...estado.byId, [id]: { ...estado.byId[id]!, status: 'running' } } };
      }
      return {
        byId: {
          ...estado.byId,
          [id]: { status: 'running', turns: 0, startedAt: Date.now(), exitCode: null },
        },
      };
    }),

  markTurn: (id) =>
    set((estado) => {
      const atual = estado.byId[id];
      if (!atual) return estado;
      return { byId: { ...estado.byId, [id]: { ...atual, turns: atual.turns + 1 } } };
    }),

  markExit: (id, code) =>
    set((estado) => {
      const atual = estado.byId[id];
      if (!atual) return estado;
      return { byId: { ...estado.byId, [id]: { ...atual, status: 'exited', exitCode: code } } };
    }),

  unregister: (id) =>
    set((estado) => {
      if (!estado.byId[id]) return estado;
      const resto = { ...estado.byId };
      delete resto[id];
      return { byId: resto };
    }),
}));
