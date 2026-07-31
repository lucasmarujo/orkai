import { useEffect, useState } from 'react';

import { useAttention } from './agents/useAttention';
import { Canvas } from './canvas/Canvas';
import { checkForUpdate } from './ipc/updater';
import { useWorkspaceStore } from './stores/workspaceStore';
import { AgentPanel } from './ui/AgentPanel';
import { CommandPalette } from './ui/CommandPalette';
import { Toolbar } from './ui/Toolbar';
import { useTheme } from './ui/theme';
import { WorkflowSidebar } from './ui/WorkflowSidebar';

export function App() {
  const { load, flush, loading, error, nodes } = useWorkspaceStore();
  const [mostrarPainel, setMostrarPainel] = useState(false);
  const [mostrarPalette, setMostrarPalette] = useState(false);
  const [sidebarRecolhida, setSidebarRecolhida] = useState(false);
  const { theme, toggle: alternarTema } = useTheme();
  useAttention();

  useEffect(() => {
    void load();
  }, [load]);

  // Sem await: estando atualizado a checagem não aparece, e o canvas não espera a rede.
  useEffect(() => {
    void checkForUpdate();
  }, []);

  // Recuperacao de crash: o viewport tem debounce, entao um fechamento abrupto perderia
  // o ultimo pan/zoom. Os nos ja sao persistidos no fim de cada gesto.
  useEffect(() => {
    const aoFechar = () => void flush();
    window.addEventListener('beforeunload', aoFechar);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') aoFechar();
    });
    return () => window.removeEventListener('beforeunload', aoFechar);
  }, [flush]);

  return (
    <div className="app">
      <Toolbar
        theme={theme}
        onToggleTheme={alternarTema}
        onTogglePanel={() => setMostrarPainel((v) => !v)}
      />
      <div className="app__body">
        <WorkflowSidebar
          collapsed={sidebarRecolhida}
          onToggle={() => setSidebarRecolhida((v) => !v)}
        />
        <div className="app__canvas">
          {loading ? (
            <p className="app__status">Carregando workspace…</p>
          ) : (
            <Canvas onPalette={() => setMostrarPalette(true)} />
          )}
          {mostrarPainel && <AgentPanel nodes={nodes} onClose={() => setMostrarPainel(false)} />}
        </div>
      </div>
      {mostrarPalette && (
        <CommandPalette onClose={() => setMostrarPalette(false)} onToggleTheme={alternarTema} />
      )}
      {error && (
        <p className="app__erro" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
