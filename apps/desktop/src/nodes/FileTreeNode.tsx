import { useCallback, useEffect, useState } from 'react';

import * as api from '../ipc/commands';
import type { DirEntry } from '../ipc/commands';
import type { CanvasNode } from '../ipc/types';
import { useWorkspaceStore } from '../stores/workspaceStore';

/** Extensões que o `MarkdownNode` mostra bem. Clicar nas outras não faz nada ainda. */
const ABRIVEIS = ['.md', '.txt'];

/**
 * Árvore de arquivos do workflow.
 *
 * Carrega um nível por vez, conforme o usuário expande: um walk recursivo pagaria o
 * custo da pasta inteira para mostrar três linhas.
 */
export function FileTreeNode({ node }: { node: CanvasNode }) {
  const raiz = node.kind.type === 'fileTree' ? node.kind.root : '';
  const createNode = useWorkspaceStore((s) => s.createNode);
  const nodes = useWorkspaceStore((s) => s.nodes);
  // ponytail: expansão é estado de sessão, não persistida — persistir exigiria campo
  // no NodeKind e migração. Se tiver que sobreviver ao restart, aí vale o campo.
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  const abrirArquivo = useCallback(
    async (caminho: string) => {
      if (!ABRIVEIS.some((ext) => caminho.toLowerCase().endsWith(ext))) return;
      // Já existe uma nota nesse arquivo: duplicar daria duas telas editando o mesmo
      // disco, e a última a salvar venceria em silêncio.
      const existente = nodes.find(
        (n) => n.kind.type === 'markdown' && n.kind.filePath === caminho,
      );
      if (existente) {
        useWorkspaceStore.getState().setSelection(new Set([existente.id]));
        return;
      }
      // Ao lado da árvore: a nota aparece onde o olho já está, sem cobri-la.
      await createNode(
        { type: 'markdown', filePath: caminho, color: '' },
        { x: node.position.x + node.size.width + 40, y: node.position.y },
      );
    },
    [createNode, node.position.x, node.position.y, node.size.width, nodes],
  );

  const alternar = (caminho: string) => {
    setAbertas((atuais) => {
      const proximas = new Set(atuais);
      if (!proximas.delete(caminho)) proximas.add(caminho);
      return proximas;
    });
  };

  return (
    <div className="filetree" onPointerDown={(e) => e.stopPropagation()}>
      {erro && (
        <p className="filetree__aviso" role="alert">
          {erro}
        </p>
      )}
      <Pasta
        caminho={raiz}
        nivel={0}
        abertas={abertas}
        onAlternar={alternar}
        onAbrirArquivo={(c) => void abrirArquivo(c)}
        onErro={setErro}
      />
    </div>
  );
}

interface PastaProps {
  caminho: string;
  nivel: number;
  abertas: Set<string>;
  onAlternar: (caminho: string) => void;
  onAbrirArquivo: (caminho: string) => void;
  onErro: (erro: string | null) => void;
}

/** Um nível da árvore. Busca o conteúdo ao montar; só monta quando o pai está aberto. */
function Pasta({ caminho, nivel, abertas, onAlternar, onAbrirArquivo, onErro }: PastaProps) {
  const [entradas, setEntradas] = useState<DirEntry[]>([]);

  useEffect(() => {
    let vivo = true;
    api
      .dirList(caminho)
      .then((lista) => {
        if (!vivo) return;
        setEntradas(lista);
        onErro(null);
      })
      .catch((e) => vivo && onErro(String(e)));
    return () => {
      vivo = false;
    };
  }, [caminho, onErro]);

  return (
    <ul className="filetree__lista">
      {entradas.map((entrada) => {
        const aberta = abertas.has(entrada.path);
        return (
          <li key={entrada.path}>
            <button
              type="button"
              className="filetree__item"
              style={{ paddingLeft: `${nivel * 14 + 6}px` }}
              aria-expanded={entrada.isDir ? aberta : undefined}
              onClick={() =>
                entrada.isDir ? onAlternar(entrada.path) : onAbrirArquivo(entrada.path)
              }
            >
              <span className="filetree__icone">{entrada.isDir ? (aberta ? '▾' : '▸') : '·'}</span>
              {entrada.name}
            </button>
            {entrada.isDir && aberta && (
              <Pasta
                caminho={entrada.path}
                nivel={nivel + 1}
                abertas={abertas}
                onAlternar={onAlternar}
                onAbrirArquivo={onAbrirArquivo}
                onErro={onErro}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
