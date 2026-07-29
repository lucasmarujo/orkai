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

/** Como a nota é exibida. `fonte` mostra o Markdown cru; `estilizado`, o resultado. */
type ModoVisualizacao = 'estilizado' | 'fonte';

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
  // ponytail: preferência de sessão, não persistida — persistir exigiria campo no NodeKind
  // e migração do banco. Se o modo tiver que sobreviver ao restart, aí vale o campo.
  const [modo, setModo] = useState<ModoVisualizacao>('estilizado');
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

  const editor = (
    <textarea
      ref={textareaRef}
      className="markdown-host markdown-host--editor"
      value={conteudo}
      spellCheck={false}
      aria-label="Markdown da nota"
      onChange={(e) => aoEditar(e.target.value)}
      onBlur={() => setEditando(false)}
    />
  );

  // Modo fonte: o `.md` cru é a própria área de edição, sem preview nenhum.
  // Modo estilizado: só o resultado, e ao editar ele fica ao vivo abaixo do editor.
  let corpo;
  if (modo === 'fonte') {
    corpo = editor;
  } else if (editando) {
    corpo = (
      <div className="markdown-split">
        {editor}
        <div
          className="markdown-host markdown-preview"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    );
  } else {
    corpo = (
      <div
        className="markdown-host markdown-preview markdown-preview--leitura"
        role="button"
        tabIndex={0}
        title="Clique duplo para editar"
        onDoubleClick={() => setEditando(true)}
        onKeyDown={(e) => e.key === 'Enter' && setEditando(true)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className="markdown-wrap" style={{ background: fundo }}>
      <div className="markdown-bar">
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
        <button
          type="button"
          className="markdown-modo"
          title={modo === 'estilizado' ? 'Ver o Markdown sem estilo' : 'Ver o Markdown com estilo'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setModo((m) => (m === 'estilizado' ? 'fonte' : 'estilizado'))}
        >
          {modo === 'estilizado' ? 'Sem estilo' : 'Com estilo'}
        </button>
      </div>

      {corpo}
    </div>
  );
}
