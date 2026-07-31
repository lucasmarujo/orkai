import { useEffect, useMemo, useState } from 'react';

import { BUILTIN_ROLES, PROVIDERS, buildAgentKind } from '../agents/profiles';
import * as api from '../ipc/commands';
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
  // `undefined` enquanto a checagem não voltou: não acusa ausência antes de saber.
  const [instalado, setInstalado] = useState<boolean | undefined>(undefined);
  const [repoGit, setRepoGit] = useState(false);
  const [isolar, setIsolar] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const provider = PROVIDERS.find((p) => p.id === providerId)!;

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  // Sem isto, escolher um provider que não está no PATH cria um nó que morre no
  // primeiro spawn com "os error 2", sem dizer que o CLI não está instalado.
  useEffect(() => {
    let vivo = true;
    setInstalado(undefined);
    void api
      .commandAvailable(provider.command)
      .then((ok) => {
        if (vivo) setInstalado(ok);
      })
      .catch(() => {
        // Falha na checagem não bloqueia a criação: o spawn ainda reporta o erro.
        if (vivo) setInstalado(true);
      });
    return () => {
      vivo = false;
    };
  }, [provider.command]);

  // Isolamento só é oferecido em pasta versionada: sem repositório não há worktree.
  useEffect(() => {
    void api
      .gitWorkflowIsRepo()
      .then(setRepoGit)
      .catch(() => setRepoGit(false));
  }, []);

  const criar = async () => {
    const role = roles.find((r) => r.id === roleId) ?? roles[0]!;
    const kind = buildAgentKind(provider, role, cwd.trim() || defaultCwd);
    if (!isolar) {
      onCreate(kind);
      return;
    }

    // O worktree nasce antes do nó: se o git recusar, nada é criado e o erro aparece
    // no diálogo, em vez de um agente apontando para uma pasta que não existe.
    setCriando(true);
    setErro(null);
    try {
      const pasta = await api.gitWorktreeCreate(kind.name);
      onCreate({ ...kind, cwd: pasta });
    } catch (e) {
      setErro(String(e));
    } finally {
      setCriando(false);
    }
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
        {/* Fora do `<label>`: dentro, o aviso entraria no nome acessível do campo. */}
        {instalado === false && (
          <p className="dialog__aviso" role="alert">
            {`\`${provider.command}\` não foi encontrado no PATH. Instale o CLI do ${provider.label} e reabra o Orkai.`}
          </p>
        )}

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
            value={isolar ? 'worktree próprio (criado ao confirmar)' : cwd}
            spellCheck={false}
            disabled={isolar}
            onChange={(e) => setCwd(e.target.value)}
            placeholder={defaultCwd}
          />
        </label>

        {repoGit && (
          <label className="dialog__check">
            <input
              type="checkbox"
              checked={isolar}
              onChange={(e) => setIsolar(e.target.checked)}
            />
            <span>
              Isolar em worktree git
              <small>
                O agente trabalha numa branch e numa pasta próprias. Você integra ou
                descarta pelo painel.
              </small>
            </span>
          </label>
        )}

        {erro && (
          <p className="dialog__aviso" role="alert">
            {erro}
          </p>
        )}

        <div className="dialog__actions">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="dialog__primary"
            disabled={instalado === false || criando}
            onClick={() => void criar()}
          >
            {criando ? 'Criando worktree…' : 'Criar agente'}
          </button>
        </div>
      </div>
    </div>
  );
}
