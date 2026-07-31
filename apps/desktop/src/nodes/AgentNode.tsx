import { useEffect, useMemo } from 'react';

import { notifyAgentExit } from '../ipc/notify';
import type { CanvasNode } from '../ipc/types';
import { useAgentActivity } from '../stores/agentActivityStore';
import { usePtySession } from './usePtySession';

/**
 * Nó de agente de IA. É o mesmo terminal do `TerminalNode` — o backend é que roda o CLI
 * do agente em vez de um shell, a partir do `NodeKind::Agent`. A distinção visual (a
 * faixa de role) e a atividade (turnos, status, notificação de saída) ficam aqui.
 */
export function AgentNode({ node }: { node: CanvasNode }) {
  const nome = node.kind.type === 'agent' ? node.kind.name : 'Agente';
  const role = node.kind.type === 'agent' ? node.kind.role : '';
  const { register, markTurn, markExit } = useAgentActivity();

  useEffect(() => {
    register(node.id);
  }, [node.id, register]);

  const hooks = useMemo(
    () => ({
      onTurn: () => markTurn(node.id),
      onExit: (code: number) => {
        markExit(node.id, code);
        void notifyAgentExit(nome, code);
      },
    }),
    [markExit, markTurn, node.id, nome],
  );

  const hostRef = usePtySession(node.id, hooks);
  const pendentes = useAgentActivity((s) => s.pending[node.id] ?? 0);
  const atencao = useAgentActivity((s) => s.attention[node.id]);

  return (
    <div className={`agent-host agent-host--${atencao ?? 'none'}`}>
      <span className="agent-host__role">
        {role}
        {atencao === 'waiting' && (
          <span className="agent-host__atencao" title="Parado numa pergunta: precisa de você">
            precisa de você
          </span>
        )}
        {pendentes > 0 && (
          <span className="agent-host__badge" title={`${pendentes} mensagem(ns) na caixa`}>
            {pendentes}
          </span>
        )}
      </span>
      <div ref={hostRef} className="terminal-host" />
    </div>
  );
}
