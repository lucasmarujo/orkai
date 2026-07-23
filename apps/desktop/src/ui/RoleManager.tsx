import { useEffect, useMemo, useState } from 'react';

import { BUILTIN_ROLES } from '../agents/profiles';
import { useRoles } from '../stores/rolesStore';

/**
 * Cria e gerencia roles de agente e seus prompts. Roles embutidas são só leitura;
 * as customizadas podem ser editadas e removidas. A edição carrega a role no formulário.
 */
export function RoleManager() {
  // Seleciona `custom` (referencia estavel) e deriva a lista aqui: um seletor que
  // devolvesse array novo a cada render faria o Zustand ver mudanca sempre — loop.
  const custom = useRoles((s) => s.custom);
  const load = useRoles((s) => s.load);
  const upsert = useRoles((s) => s.upsert);
  const remove = useRoles((s) => s.remove);

  const roles = useMemo(() => [...BUILTIN_ROLES, ...custom], [custom]);
  const idsCustom = useMemo(() => new Set(custom.map((r) => r.id)), [custom]);

  const [editId, setEditId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  const limpar = () => {
    setEditId(null);
    setLabel('');
    setPrompt('');
  };

  const salvar = async () => {
    if (!label.trim()) return;
    await upsert({ id: editId ?? undefined, label, systemPrompt: prompt });
    limpar();
  };

  const editar = (id: string, l: string, p: string) => {
    setEditId(id);
    setLabel(l);
    setPrompt(p);
  };

  return (
    <div className="roles">
      <ul className="roles__lista">
        {roles.map((r) => {
          const custom = idsCustom.has(r.id);
          return (
            <li key={r.id} className="roles__item">
              <div className="roles__info">
                <span className="roles__nome">{r.label}</span>
                {!custom && <span className="roles__tag">embutida</span>}
                {r.systemPrompt && <span className="roles__prompt">{r.systemPrompt}</span>}
              </div>
              {custom && (
                <div className="roles__acoes">
                  <button
                    type="button"
                    aria-label={`Editar ${r.label}`}
                    onClick={() => editar(r.id, r.label, r.systemPrompt)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${r.label}`}
                    onClick={() => void remove(r.id)}
                  >
                    ×
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="roles__form">
        <span className="roles__form-titulo">{editId ? 'Editar role' : 'Nova role'}</span>
        <input
          type="text"
          placeholder="Nome (ex.: Security)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <textarea
          placeholder="Prompt de sistema do agente"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="roles__form-acoes">
          {editId && (
            <button type="button" onClick={limpar}>
              Cancelar
            </button>
          )}
          <button type="button" className="roles__salvar" disabled={!label.trim()} onClick={() => void salvar()}>
            {editId ? 'Salvar' : 'Criar role'}
          </button>
        </div>
      </div>
    </div>
  );
}
