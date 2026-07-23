use thiserror::Error;

pub type Result<T> = std::result::Result<T, StorageError>;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("erro de banco: {0}")]
    Database(#[from] sqlx::Error),

    #[error("falha ao aplicar migrations: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),

    #[error("workflow nao encontrado: {0}")]
    WorkflowNotFound(String),

    #[error("registro corrompido em {table}.{column}: {source}")]
    Corrupted {
        table: &'static str,
        column: &'static str,
        #[source]
        source: serde_json::Error,
    },

    #[error("id invalido no banco: {0}")]
    InvalidId(#[from] uuid::Error),

    #[error("dado invalido vindo do banco: {0}")]
    InvalidDomain(#[from] orkai_core::DomainError),
}
