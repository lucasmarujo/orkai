import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useMemo, useRef, useState } from 'react';

import * as api from '../ipc/commands';
import type { CanvasNode } from '../ipc/types';
import { createDebouncer } from '../stores/debounce';
import { useWorkspaceStore } from '../stores/workspaceStore';

const SALVAR_DELAY_MS = 500;
const salvamento = createDebouncer(SALVAR_DELAY_MS);

/** Paleta de cores da nota. Chave persistida no nó; valor é a cor de fundo (tema-neutra). */
export const CORES_NOTA: Record<string, string> = {
  '': 'var(--surface)',
  amber: '#3a2f10',
  green: '#12301a',
  blue: '#12233f',
  purple: '#2a1838',
  rose: '#3a1620',
};

/**
 * O `.md` continua sendo um arquivo de verdade no disco: o banco guarda so o
 * ponteiro e a posicao do no.
 */
export function MarkdownNode({ node }: { node: CanvasNode }) {
  const filePath = node.kind.type === 'markdown' ? node.kind.filePath : '';
  const cor = node.kind.type === 'markdown' ? node.kind.color : '';
  const setNoteColor = useWorkspaceStore((s) => s.setNoteColor);
  const [conteudo, setConteudo] = useState('');
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fundo = CORES_NOTA[cor] ?? CORES_NOTA[''];

  useEffect(() => {
    let vivo = true;
    api
      .fileRead(filePath)
      .then((texto) => {
        if (vivo) setConteudo(texto);
      })
      .catch((e) => vivo && setErro(String(e)));
    return () => {
      vivo = false;
    };
  }, [filePath]);

  useEffect(() => {
    if (editando) textareaRef.current?.focus();
  }, [editando]);

  const html = useMemo(() => {
    // O conteudo vem de arquivo local, que pode ter vindo de um repositorio de
    // terceiro: sanitizar antes de injetar nao e opcional.
    return DOMPurify.sanitize(marked.parse(conteudo, { async: false }));
  }, [conteudo]);

  const aoEditar = (texto: string) => {
    setConteudo(texto);
    salvamento.schedule(node.id, () => {
      api.fileWrite(filePath, texto).catch((e) => setErro(String(e)));
    });
  };

  if (erro) return <div className="markdown-host markdown-host--erro">{erro}</div>;

  return (
    <div className="markdown-wrap" style={{ background: fundo }}>
      <div className="markdown-swatches" role="group" aria-label="Cor da nota">
        {Object.keys(CORES_NOTA).map((chave) => (
          <button
            key={chave || 'default'}
            type="button"
            className={`markdown-swatch ${chave === cor ? 'is-active' : ''}`}
            style={{ background: CORES_NOTA[chave] }}
            title={chave || 'padrão'}
            aria-label={`Cor ${chave || 'padrão'}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void setNoteColor(node.id, chave)}
          />
        ))}
      </div>

      {editando ? (
        <textarea
          ref={textareaRef}
          className="markdown-host markdown-host--editor"
          value={conteudo}
          spellCheck={false}
          onChange={(e) => aoEditar(e.target.value)}
          onBlur={() => setEditando(false)}
        />
      ) : (
        <div
          className="markdown-host markdown-preview"
          role="button"
          tabIndex={0}
          title="Clique duplo para editar"
          onDoubleClick={() => setEditando(true)}
          onKeyDown={(e) => e.key === 'Enter' && setEditando(true)}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
