import { useEffect, useState } from 'react';

import { usePrompts } from '../stores/promptsStore';

/** Formata um instante como `12/03 14:07`. */
function quando(em: number): string {
  const d = new Date(em);
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/**
 * Biblioteca de prompts reutilizáveis, com histórico.
 *
 * Cada edição guarda o texto anterior como revisão, e restaurar traz de volta sem
 * perder o atual. Disparar um prompt para um agente é pelo `Ctrl+K`, com o agente
 * selecionado no canvas.
 */
export function PromptLibrary() {
  // Referência estável (ver `rolesStore`): derivar lista num seletor faria o Zustand
  // ver mudança a cada render.
  const prompts = usePrompts((s) => s.prompts);
  const load = usePrompts((s) => s.load);
  const upsert = usePrompts((s) => s.upsert);
  const remove = usePrompts((s) => s.remove);
  const restaurar = usePrompts((s) => s.restaurar);

  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [texto, setTexto] = useState('');
  const [tags, setTags] = useState('');
  const [abertoId, setAbertoId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const limpar = () => {
    setEditId(null);
    setNome('');
    setTexto('');
    setTags('');
  };

  const salvar = async () => {
    if (!nome.trim()) return;
    await upsert({
      id: editId ?? undefined,
      nome,
      texto,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    limpar();
  };

  return (
    <div className="roles">
      <ul className="roles__lista">
        {prompts.length === 0 && <li className="roles__item">Nenhum prompt salvo ainda.</li>}
        {prompts.map((p) => (
          <li key={p.id} className="roles__item">
            <div className="roles__info">
              <span className="roles__nome">{p.nome}</span>
              {p.tags.map((tag) => (
                <span key={tag} className="roles__tag">
                  {tag}
                </span>
              ))}
              <span className="roles__prompt">{p.texto}</span>

              {p.revisoes.length > 0 && (
                <button
                  type="button"
                  className="roles__revisoes-toggle"
                  aria-expanded={abertoId === p.id}
                  onClick={() => setAbertoId((atual) => (atual === p.id ? null : p.id))}
                >
                  {p.revisoes.length} {p.revisoes.length === 1 ? 'revisão' : 'revisões'}
                </button>
              )}
              {abertoId === p.id && (
                <ul className="roles__revisoes">
                  {p.revisoes.map((revisao, i) => (
                    <li key={`${revisao.em}-${i}`}>
                      <span className="roles__revisao-quando">{quando(revisao.em)}</span>
                      <span className="roles__revisao-texto">{revisao.texto}</span>
                      <button
                        type="button"
                        aria-label={`Restaurar revisão de ${quando(revisao.em)}`}
                        onClick={() => void restaurar(p.id, i)}
                      >
                        Restaurar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="roles__acoes">
              <button
                type="button"
                aria-label={`Editar ${p.nome}`}
                onClick={() => {
                  setEditId(p.id);
                  setNome(p.nome);
                  setTexto(p.texto);
                  setTags(p.tags.join(', '));
                }}
              >
                ✎
              </button>
              <button
                type="button"
                aria-label={`Excluir ${p.nome}`}
                onClick={() => void remove(p.id)}
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="roles__form">
        <span className="roles__form-titulo">{editId ? 'Editar prompt' : 'Novo prompt'}</span>
        <input
          type="text"
          placeholder="Nome (ex.: Revisor de PR)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <textarea
          placeholder="Texto do prompt"
          rows={4}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <input
          type="text"
          placeholder="Tags separadas por vírgula"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <div className="roles__form-acoes">
          {editId && (
            <button type="button" onClick={limpar}>
              Cancelar
            </button>
          )}
          <button
            type="button"
            className="roles__salvar"
            disabled={!nome.trim()}
            onClick={() => void salvar()}
          >
            {editId ? 'Salvar' : 'Criar prompt'}
          </button>
        </div>
      </div>
    </div>
  );
}
