//! Pseudo-terminais. Hoje so ConPTY (Windows); SSH e `docker exec` entram como
//! implementacoes adicionais de [`PtyBackend`] sem mexer no resto do app.

mod conpty;
mod error;
mod program;
mod registry;
mod scrollback;
mod session;

pub use conpty::{default_shell, ConPtyBackend};
pub use error::{PtyError, Result};
pub use program::{resolve, Program};
pub use registry::PtyRegistry;
pub use scrollback::Scrollback;
pub use session::{PtyEvent, PtySession, PtySpec};

use std::sync::Arc;

/// Callback de eventos da sessao. `Arc` porque leitura e espera do processo rodam
/// em threads separadas — ver [`ConPtyBackend`].
pub type PtyEventSink = Arc<dyn Fn(PtyEvent) + Send + Sync + 'static>;

/// Fonte de sessoes de terminal.
pub trait PtyBackend: Send + Sync {
    /// Inicia um processo em um PTY. `on_event` e chamado a cada bloco de bytes lido
    /// e uma vez quando o processo termina.
    fn spawn(&self, spec: PtySpec, on_event: PtyEventSink) -> Result<PtySession>;
}
