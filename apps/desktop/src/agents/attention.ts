import type { AgentAttention, AttentionStatus } from '../ipc/commands';

/**
 * Regras de apresentação da camada de atenção.
 *
 * A detecção mora no Rust (é lá que a saída do PTY sempre chega, mesmo com o nó
 * virtualizado); aqui fica só o que o front decide a partir dela: quem virou pendência
 * agora — a transição, não o estado — e como cada estado se chama para o humano.
 */

/**
 * Agentes que acabaram de entrar em `waiting`.
 *
 * Só a transição gera notificação: avisar a cada polling enquanto o agente segue parado
 * na mesma pergunta transformaria o aviso em ruído, e ruído é ignorado.
 */
export function novosEsperando(
  anterior: Record<string, AttentionStatus>,
  atual: AgentAttention[],
): string[] {
  return atual
    .filter((a) => a.status === 'waiting' && anterior[a.nodeId] !== 'waiting')
    .map((a) => a.nodeId);
}

/** Índice `nodeId -> status`, o formato que a store guarda. */
export function porNo(atual: AgentAttention[]): Record<string, AttentionStatus> {
  return Object.fromEntries(atual.map((a) => [a.nodeId, a.status]));
}

const ROTULOS: Record<AttentionStatus, string> = {
  running: 'trabalhando',
  waiting: 'precisa de você',
  idle: 'ocioso',
  exited: 'encerrado',
};

export function rotuloAtencao(status: AttentionStatus | undefined): string {
  return status ? ROTULOS[status] : 'inativo';
}

/** Ordem de urgência para a lista do painel: quem espera aparece primeiro. */
const PESO: Record<AttentionStatus, number> = {
  waiting: 0,
  running: 1,
  idle: 2,
  exited: 3,
};

export function porUrgencia(a: AttentionStatus | undefined, b: AttentionStatus | undefined): number {
  const peso = (s: AttentionStatus | undefined) => (s ? PESO[s] : 4);
  return peso(a) - peso(b);
}
