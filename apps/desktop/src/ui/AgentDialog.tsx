import { useEffect, useMemo, useState } from 'react';

import { BUILTIN_ROLES, PROVIDERS, buildAgentKind } from '../agents/profiles';
import type { NodeKind } from '../ipc/types';
import { useRoles } from '../stores/rolesStore';

interface Props {
  /** Pasta sugerida (a raiz do workspace). */
  defaultCwd: string;
  onCancel: () => void;
  onCreate: (kind: Extract<NodeKind, { type: 'agent' }>) => void;
}

/**
 * Escolhe provider, role e pasta de trabalho do agente. As roles vêm do store: as
 * embutidas mais as que o usuário criou na sidebar.
 */
export function AgentDialog({ defaultCwd, onCancel, onCreate }: Props) {
  // `custom` e referencia estavel; derivar aqui evita o loop de re-render que um
  // seletor devolvendo array novo causaria.
  const custom = useRoles((s) => s.custom);
  const loadRoles = useRoles((s) => s.load);
  const roles = useMemo(() => [...BUILTIN_ROLES, ...custom], [custom]);

  const [providerId, setProviderId] = useState(PROVIDERS[0]!.id);
  const [roleId, setRoleId] = useState(BUILTIN_ROLES[0]!.id);
  const [cwd, setCwd] = useState(defaultCwd);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const criar = () => {
    const provider = PROVIDERS.find((p) => p.id === providerId)!;
    const role = roles.find((r) => r.id === roleId) ?? roles[0]!;
    onCreate(buildAgentKind(provider, role, cwd.trim() || defaultCwd));
  };

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Novo agente">
      <div className="dialog">
        <h2 className="dialog__title">Novo agente</h2>

        <label className="dialog__field">
          <span>Provider</span>
          <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="dialog__field">
          <span>Role</span>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <label className="dialog__field">
          <span>Pasta de trabalho</span>
          <input
            type="text"
            value={cwd}
            spellCheck={false}
            onChange={(e) => setCwd(e.target.value)}
            placeholder={defaultCwd}
          />
        </label>

        <div className="dialog__actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="dialog__primary" onClick={criar}>
            Criar agente
          </button>
        </div>
      </div>
    </div>
  );
}
