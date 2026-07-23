use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use portable_pty::{Child, MasterPty, PtySize};

use crate::{PtyError, Result, Scrollback};

/// Parametros de criacao de uma sessao de terminal.
#[derive(Clone)]
pub struct PtySpec {
    pub shell: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub cols: u16,
    pub rows: u16,
    /// Historico a pre-carregar no scrollback antes do processo comecar. Usado para
    /// continuar a conversa de um agente apos reabrir o app.
    pub seed: Vec<u8>,
}

impl PtySpec {
    pub fn new(shell: impl Into<String>, cwd: impl Into<PathBuf>) -> Self {
        Self {
            shell: shell.into(),
            args: Vec::new(),
            cwd: cwd.into(),
            cols: 80,
            rows: 24,
            seed: Vec::new(),
        }
    }

    pub fn with_seed(mut self, seed: Vec<u8>) -> Self {
        self.seed = seed;
        self
    }

    pub fn with_size(mut self, cols: u16, rows: u16) -> Self {
        // Zero quebra o ConPTY; o front manda 0 enquanto o no ainda nao tem layout.
        self.cols = cols.max(1);
        self.rows = rows.max(1);
        self
    }

    pub fn with_args(mut self, args: Vec<String>) -> Self {
        self.args = args;
        self
    }

    pub(crate) fn pty_size(&self) -> PtySize {
        PtySize {
            rows: self.rows.max(1),
            cols: self.cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        }
    }
}

/// Evento emitido pela thread leitora da sessao.
#[derive(Debug, Clone, PartialEq)]
pub enum PtyEvent {
    Data(Vec<u8>),
    Exit { code: i32 },
}

/// Sessao viva. Derrubar a struct mata o processo filho.
pub struct PtySession {
    pub(crate) master: Box<dyn MasterPty + Send>,
    pub(crate) writer: Mutex<Box<dyn Write + Send>>,
    pub(crate) child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    pub(crate) scrollback: Arc<Mutex<Scrollback>>,
}

impl PtySession {
    pub fn write(&self, bytes: &[u8]) -> Result<()> {
        let mut writer = self.writer.lock().expect("writer envenenado");
        writer.write_all(bytes)?;
        writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        let size = PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        };
        self.master.resize(size).map_err(PtyError::Open)
    }

    /// Historico acumulado, para remontar o terminal no front sem perder contexto.
    pub fn scrollback(&self) -> Vec<u8> {
        self.scrollback
            .lock()
            .expect("scrollback envenenado")
            .snapshot()
    }

    /// Handle do scrollback, para a tarefa de persistencia salvar snapshots sem
    /// segurar o lock alem do necessario. `strong_count` cai quando a sessao morre,
    /// que e como a tarefa sabe parar.
    pub fn scrollback_arc(&self) -> Arc<Mutex<Scrollback>> {
        Arc::clone(&self.scrollback)
    }

    pub fn kill(&self) -> Result<()> {
        self.child.lock().expect("child envenenado").kill()?;
        Ok(())
    }
}

impl Drop for PtySession {
    fn drop(&mut self) {
        if let Err(erro) = self.kill() {
            tracing::debug!(%erro, "processo do terminal ja havia encerrado");
        }
    }
}
