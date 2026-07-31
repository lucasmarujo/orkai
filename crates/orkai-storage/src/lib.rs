//! Persistencia do workspace em SQLite.
//!
//! O banco guarda estrutura (posicao, tamanho, tipo). O conteudo continua sendo
//! arquivo de verdade no disco: `.md` e `.md`.

mod error;
mod repository;

pub use error::{Result, StorageError};
pub use repository::{SearchDoc, SearchHit, WorkflowSummary, WorkspaceRepository};
