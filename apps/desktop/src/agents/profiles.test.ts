import { describe, expect, it } from 'vitest';

import { BUILTIN_ROLES, PROVIDERS, buildAgentKind } from './profiles';

const claude = PROVIDERS.find((p) => p.id === 'claude')!;
const codex = PROVIDERS.find((p) => p.id === 'codex')!;
const architect = BUILTIN_ROLES.find((r) => r.id === 'architect')!;
const generic = BUILTIN_ROLES.find((r) => r.id === 'generic')!;

describe('PROVIDERS', () => {
  it('inclui OpenCode', () => {
    const oc = PROVIDERS.find((p) => p.id === 'opencode');
    expect(oc?.command).toBe('opencode');
  });
});

describe('buildAgentKind', () => {
  it('usa o comando do provider e a pasta informada', () => {
    const kind = buildAgentKind(claude, architect, 'C:/dev/proj');
    expect(kind.type).toBe('agent');
    expect(kind.command).toBe('claude');
    expect(kind.cwd).toBe('C:/dev/proj');
    expect(kind.role).toBe('Architect');
  });

  it('injeta o prompt de sistema quando o CLI tem flag e há prompt', () => {
    const kind = buildAgentKind(claude, architect, 'C:/dev');
    expect(kind.args).toContain('--append-system-prompt');
    expect(kind.args[kind.args.indexOf('--append-system-prompt') + 1]).toBe(architect.systemPrompt);
  });

  it('não injeta flag quando o provider não a suporta', () => {
    const kind = buildAgentKind(codex, architect, 'C:/dev');
    expect(kind.args).not.toContain('--append-system-prompt');
  });

  it('não injeta flag quando a role não tem prompt', () => {
    const kind = buildAgentKind(claude, generic, 'C:/dev');
    expect(kind.args).not.toContain('--append-system-prompt');
    expect(kind.systemPrompt).toBe('');
  });

  it('mantém o systemPrompt no kind mesmo sem flag, para o CLI ler de outro jeito', () => {
    const kind = buildAgentKind(codex, architect, 'C:/dev');
    expect(kind.systemPrompt).toBe(architect.systemPrompt);
  });
});
