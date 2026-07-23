import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';

import { decodeBase64, encodeTextBase64 } from '../ipc/base64';
import * as api from '../ipc/commands';
import type { PtyDataEvent, PtyExitEvent } from '../ipc/types';

/** Tema alinhado ao Windows Terminal (Campbell), para o TUI parecer o de sempre. */
const TEMA = {
  background: '#0c0c0c',
  foreground: '#cccccc',
  cursor: '#cccccc',
  black: '#0c0c0c',
  red: '#c50f1f',
  green: '#13a10e',
  yellow: '#c19c00',
  blue: '#0037da',
  magenta: '#881798',
  cyan: '#3a96dd',
  white: '#cccccc',
  brightBlack: '#767676',
  brightRed: '#e74856',
  brightGreen: '#16c60c',
  brightYellow: '#f9f1a5',
  brightBlue: '#3b78ff',
  brightMagenta: '#b4009e',
  brightCyan: '#61d6d6',
  brightWhite: '#f2f2f2',
};

const RESIZE_DEBOUNCE_MS = 80;

/**
 * Liga um `<div>` a um PTY do backend: xterm.js + ConPTY.
 *
 * Núcleo compartilhado entre `TerminalNode` e `AgentNode` — a diferença entre um shell
 * e um agente vive no backend (o `NodeKind`), não aqui. O processo continua vivo quando
 * o nó é desmontado pela virtualização; só `node_delete` mata a sessão.
 */
/** Ganchos opcionais de atividade, usados pelo `AgentNode`; terminal não passa nada. */
export interface PtyHooks {
  /** Um prompt foi submetido (Enter). */
  onTurn?: () => void;
  onExit?: (code: number) => void;
}

export function usePtySession(nodeId: string, hooks: PtyHooks = {}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Ref para os hooks não entrarem nas deps do efeito: recriar a sessão a cada render
  // mataria o terminal.
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      theme: TEMA,
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10_000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);

    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // ponytail: sem WebGL o xterm cai no renderer DOM sozinho; so perde FPS.
    }

    let vivo = true;
    const descartar: Array<() => void> = [];

    const iniciar = async () => {
      fit.fit();
      await api.ptySpawn(nodeId, term.cols, term.rows);
      if (!vivo) return;

      // Scrollback inclui o historico semeado do agente (transcript persistido) mais o
      // que a sessao ja emitiu — a mesma fonte serve para remontar apos virtualizacao.
      const historico = await api.ptyScrollback(nodeId);
      if (!vivo) return;
      if (historico) term.write(decodeBase64(historico));

      const offData = await listen<PtyDataEvent>(`pty://data/${nodeId}`, (evento) => {
        term.write(decodeBase64(evento.payload.data));
      });
      const offExit = await listen<PtyExitEvent>(`pty://exit/${nodeId}`, (evento) => {
        term.write(`\r\n\x1b[90m[processo encerrado com codigo ${evento.payload.code}]\x1b[0m\r\n`);
        hooksRef.current.onExit?.(evento.payload.code);
      });

      if (!vivo) {
        offData();
        offExit();
        return;
      }
      descartar.push(offData, offExit);
    };

    void iniciar().catch((erro) => {
      term.write(`\r\n\x1b[31mFalha ao iniciar: ${String(erro)}\x1b[0m\r\n`);
    });

    const aoDigitar = term.onData((data) => {
      void api.ptyWrite(nodeId, encodeTextBase64(data));
      // Enter marca um turno. Heurística: conta a submissão do prompt, não tokens.
      if (data.includes('\r')) hooksRef.current.onTurn?.();
    });

    // O resize e o que costuma quebrar TUI (vim, btop): sempre ConPTY depois do fit,
    // com debounce para nao inundar durante o arrasto.
    let timerResize: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      if (timerResize !== undefined) clearTimeout(timerResize);
      timerResize = setTimeout(() => {
        fit.fit();
        void api.ptyResize(nodeId, term.cols, term.rows);
      }, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(host);

    return () => {
      vivo = false;
      if (timerResize !== undefined) clearTimeout(timerResize);
      observer.disconnect();
      aoDigitar.dispose();
      descartar.forEach((off) => off());
      term.dispose();
    };
  }, [nodeId]);

  return hostRef;
}
