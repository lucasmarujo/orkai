import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from 'react';

import { useWorkflowStore } from '../stores/workflowStore';
import { useResizable } from './useResizable';

/** Nome de exibição da pasta: só o último segmento, para não estourar a sidebar. */
function nomeDaPasta(caminho: string): string {
  if (!caminho) return 'pasta padrão';
  return caminho.split(/[\\/]/).filter(Boolean).pop() ?? caminho;
}

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Sidebar recolhível de workflows. Cada workflow é ligado a uma pasta de projeto;
 * criar um novo começa pela escolha da pasta, como pedido.
 */
export function WorkflowSidebar({ collapsed, onToggle }: Props) {
  const { workflows, activeId, load, activate, create } = useWorkflowStore();
  const [criando, setCriando] = useState(false);
  const { width, onResizeStart } = useResizable('orkai.sidebar.width', 220, 'left');

  useEffect(() => {
    void load();
  }, [load]);

  const novoWorkflow = async () => {
    if (criando) return;
    setCriando(true);
    try {
      // Passo 1, sempre: escolher a pasta do projeto. O workflow vive ali.
      const pasta = await open({ directory: true, title: 'Pasta do projeto do workflow' });
      if (typeof pasta !== 'string') return; // cancelou
      const nome = nomeDaPasta(pasta);
      await create(nome, pasta);
    } finally {
      setCriando(false);
    }
  };

  if (collapsed) {
    return (
      <div className="sidebar sidebar--collapsed">
        <button
          type="button"
          className="sidebar__toggle"
          title="Mostrar workflows"
          aria-label="Mostrar workflows"
          onClick={onToggle}
        >
          ☰
        </button>
      </div>
    );
  }

  return (
    <aside className="sidebar" style={{ flexBasis: width }} aria-label="Workflows">
      <header className="sidebar__head">
        <span className="sidebar__titulo">Workflows</span>
        <button
          type="button"
          className="sidebar__toggle"
          title="Recolher"
          aria-label="Recolher sidebar"
          onClick={onToggle}
        >
          ⟨
        </button>
      </header>

      <ul className="sidebar__lista">
        {workflows.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              className={`sidebar__item ${w.id === activeId ? 'is-active' : ''}`}
              onClick={() => void activate(w.id)}
            >
              <span className="sidebar__nome">{w.name}</span>
              <span className="sidebar__pasta">{nomeDaPasta(w.rootPath)}</span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="sidebar__novo"
        disabled={criando}
        onClick={() => void novoWorkflow()}
      >
        {criando ? 'Escolhendo pasta…' : '+ Novo workflow'}
      </button>

      <div
        className="resizer resizer--right"
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar largura da barra de workflows"
        onPointerDown={onResizeStart}
      />
    </aside>
  );
}
