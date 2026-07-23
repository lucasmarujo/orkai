import type { NodeKind } from '../ipc/types';

/**
 * Catálogo estático de agentes de CLI.
 *
 * Dado de configuração, não domínio: adicionar um provider ou role é editar esta lista,
 * sem tocar em Rust nem no schema. É por isso que `role` é string livre no `NodeKind`.
 */

export interface AgentProvider {
  id: string;
  label: string;
  /** Binário chamado no PTY. Detectado no PATH ao criar (ver Rust `default_shell`). */
  command: string;
  /** Como injetar o prompt de sistema, quando o CLI suporta. */
  systemPromptFlag?: string;
  baseArgs: string[];
}

export const PROVIDERS: AgentProvider[] = [
  { id: 'claude', label: 'Claude Code', command: 'claude', systemPromptFlag: '--append-system-prompt', baseArgs: [] },
  { id: 'codex', label: 'Codex', command: 'codex', baseArgs: [] },
  { id: 'aider', label: 'Aider', command: 'aider', baseArgs: [] },
  { id: 'opencode', label: 'OpenCode', command: 'opencode', baseArgs: [] },
];

/** Role de um agente: título curto + prompt de sistema. */
export interface AgentRole {
  id: string;
  label: string;
  systemPrompt: string;
}

/** Roles embutidas (o catálogo do documento de visão). O usuário adiciona as suas. */
export const BUILTIN_ROLES: AgentRole[] = [
  { id: 'architect', label: 'Architect', systemPrompt: 'Você é um arquiteto de software. Priorize design, trade-offs e limites de módulo.' },
  { id: 'reviewer', label: 'Reviewer', systemPrompt: 'Você é um revisor de código. Foque em corretude, segurança e clareza.' },
  { id: 'backend', label: 'Backend', systemPrompt: 'Você é um engenheiro de backend. Foque em APIs, dados e confiabilidade.' },
  { id: 'frontend', label: 'Frontend', systemPrompt: 'Você é um engenheiro de frontend. Foque em UI, acessibilidade e estado.' },
  { id: 'qa', label: 'QA', systemPrompt: 'Você é um engenheiro de QA. Foque em testes, casos de borda e regressões.' },
  { id: 'devops', label: 'DevOps', systemPrompt: 'Você é um engenheiro de DevOps. Foque em build, deploy e observabilidade.' },
  { id: 'generic', label: 'Assistente', systemPrompt: '' },
];

/** Monta o `NodeKind::Agent` a partir de um provider, uma role e a pasta de trabalho. */
export function buildAgentKind(
  provider: AgentProvider,
  role: AgentRole,
  cwd: string,
): Extract<NodeKind, { type: 'agent' }> {
  const args = [...provider.baseArgs];
  // Só injeta o prompt na linha de comando quando o CLI tem flag para isso e há prompt.
  if (provider.systemPromptFlag && role.systemPrompt) {
    args.push(provider.systemPromptFlag, role.systemPrompt);
  }

  return {
    type: 'agent',
    name: `${provider.label} · ${role.label}`,
    role: role.label,
    command: provider.command,
    args,
    cwd,
    systemPrompt: role.systemPrompt,
  };
}
