import { create } from 'zustand';

import * as api from '../ipc/commands';

/**
 * Biblioteca de prompts reutilizáveis, versionada.
 *
 * Mesmo contrato do `rolesStore`: o Rust guarda um blob JSON num setting e o formato
 * é daqui. A versão fica dentro do próprio prompt como uma pilha de revisões — editar
 * empurra o texto anterior para o topo dela, e restaurar traz de volta.
 */

/** Teto de revisões por prompt: o histórico inteiro vive numa linha de `app_setting`. */
export const MAX_REVISOES = 20;

export interface Revisao {
  texto: string;
  /** Milissegundos desde a epoch. */
  em: number;
}

export interface Prompt {
  id: string;
  nome: string;
  texto: string;
  tags: string[];
  /** Textos anteriores, mais recente primeiro. */
  revisoes: Revisao[];
}

function slug(nome: string): string {
  const base = nome
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  // Nomes só com acentos/símbolos zeram o slug; o id por tempo garante unicidade.
  return base || `prompt-${Date.now()}`;
}

/** Aceita só entradas com o shape certo; ignora lixo sem derrubar a UI. */
function saneados(parsed: unknown): Prompt[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (p): p is Prompt =>
      p &&
      typeof p.id === 'string' &&
      typeof p.nome === 'string' &&
      typeof p.texto === 'string' &&
      Array.isArray(p.tags) &&
      Array.isArray(p.revisoes),
  );
}

interface PromptsState {
  /**
   * Referência estável: componentes derivam listas filtradas em `useMemo`. Um seletor
   * que devolvesse array novo a cada render viraria re-render infinito no Zustand 5.
   */
  prompts: Prompt[];
  load: () => Promise<void>;
  upsert: (prompt: { id?: string; nome: string; texto: string; tags: string[] }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Traz uma revisão de volta para o texto corrente (e ela também vira revisão). */
  restaurar: (id: string, indice: number) => Promise<void>;
}

export const usePrompts = create<PromptsState>((set, get) => {
  const persist = (prompts: Prompt[]) => {
    set({ prompts });
    void api.promptsSave(JSON.stringify(prompts));
  };

  /** Aplica um texto novo guardando o anterior como revisão. Texto igual não versiona. */
  const versionar = (prompt: Prompt, texto: string): Prompt =>
    prompt.texto === texto
      ? prompt
      : {
          ...prompt,
          texto,
          revisoes: [{ texto: prompt.texto, em: Date.now() }, ...prompt.revisoes].slice(
            0,
            MAX_REVISOES,
          ),
        };

  return {
    prompts: [],

    load: async () => {
      try {
        set({ prompts: saneados(JSON.parse(await api.promptsLoad())) });
      } catch {
        set({ prompts: [] });
      }
    },

    upsert: async ({ id, nome, texto, tags }) => {
      const titulo = nome.trim();
      if (!titulo) return;
      const alvo = id ?? slug(titulo);
      const atuais = get().prompts;

      if (!atuais.some((p) => p.id === alvo)) {
        persist([...atuais, { id: alvo, nome: titulo, texto, tags, revisoes: [] }]);
        return;
      }
      persist(
        atuais.map((p) => (p.id === alvo ? { ...versionar(p, texto), nome: titulo, tags } : p)),
      );
    },

    remove: async (id) => {
      persist(get().prompts.filter((p) => p.id !== id));
    },

    restaurar: async (id, indice) => {
      const atuais = get().prompts;
      const anterior = atuais.find((p) => p.id === id)?.revisoes[indice];
      if (!anterior) return;
      // O texto que está sendo substituído vira revisão também: restaurar não é
      // desfazer, e perder a versão atual sem aviso seria o pior desfecho.
      persist(atuais.map((p) => (p.id === id ? versionar(p, anterior.texto) : p)));
    },
  };
});
