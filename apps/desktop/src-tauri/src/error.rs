use serde::{Serialize, Serializer};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, AppError>;

/// Erro devolvido ao front. Serializa como string: o WebView so precisa da mensagem,
/// e detalhe interno de caminho/SQL nao deve vazar para a UI.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("{0}")]
    Storage(#[from] orkai_storage::StorageError),

    #[error("{0}")]
    Pty(#[from] orkai_pty::PtyError),

    #[error("{0}")]
    Domain(#[from] orkai_core::DomainError),

    #[error("falha de disco: {0}")]
    Io(#[from] std::io::Error),

    #[error("caminho fora do workspace: {0}")]
    PathOutsideWorkspace(String),

    #[error("no {0} nao tem processo para iniciar")]
    NotSpawnable(String),

    #[error("{0}")]
    Internal(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
