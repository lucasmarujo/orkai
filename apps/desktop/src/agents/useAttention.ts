import { useEffect } from 'react';

import * as api from '../ipc/commands';
import type { AttentionStatus } from '../ipc/commands';
import { notifyAgentWaiting } from '../ipc/notify';
import { useAgentActivity } from '../stores/agentActivityStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { novosEsperando, porNo } from './attention';

/** Intervalo do polling de atenção. Rápido o bastante para o aviso ser útil. */
const POLL_MS = 2000;

/**
 * Mantém o estado de atenção dos agentes vivo no app inteiro.
 *
 * Fica no `App`, não no nó nem no painel: um agente fora da tela está desmontado e um
 * painel fechado não roda — e são exatamente esses os casos em que o humano precisa ser
 * avisado de que alguém parou esperando por ele.
 *
 * ponytail: polling em vez de evento do backend. São dois campos a cada 2s; um evento
 * `agent://status` só se paga quando houver mais coisa a empurrar do Rust para o front.
 */
export function useAttention(): void {
  const setAttention = useAgentActivity((s) => s.setAttention);

  useEffect(() => {
    let vivo = true;
    let anterior: Record<string, AttentionStatus> = {};

    const tick = async () => {
      let atual;
      try {
        atual = await api.agentAttention();
      } catch {
        // Backend ocupado num tick não é motivo para derrubar o polling.
        return;
      }
      if (!vivo) return;

      for (const id of novosEsperando(anterior, atual)) {
        void notifyAgentWaiting(nomeDoAgente(id));
      }
      anterior = porNo(atual);
      setAttention(anterior);
    };

    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [setAttention]);
}

/** Lê a lista de nós fora do React: o polling não deve reiniciar a cada arrasto. */
function nomeDoAgente(id: string): string {
  const node = useWorkspaceStore.getState().nodes.find((n) => n.id === id);
  return node?.kind.type === 'agent' ? node.kind.name : 'Agente';
}
