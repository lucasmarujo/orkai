use thiserror::Error;

pub type Result<T> = std::result::Result<T, PtyError>;

#[derive(Debug, Error)]
pub enum PtyError {
    #[error("falha ao abrir o pseudo-terminal: {0}")]
    Open(#[source] anyhow::Error),

    #[error("falha ao iniciar '{command}': {source}")]
    Spawn {
        command: String,
        #[source]
        source: anyhow::Error,
    },

    #[error("falha de escrita no terminal: {0}")]
    Write(#[from] std::io::Error),

    #[error("sessao de terminal nao encontrada: {0}")]
    SessionNotFound(uuid::Uuid),
}
