//! Dominio do Orkai: workspace, nos, conexoes e viewport.
//!
//! Este crate nao faz I/O. Persistencia vive em `orkai-storage`, processos em `orkai-pty`.

mod error;
mod geometry;
mod history;
mod node;
mod viewport;
mod workspace;

pub use error::{DomainError, Result};
pub use geometry::{Size, Vec2};
pub use history::{Command, UndoStack};
pub use node::{Node, NodeId, NodeKind};
pub use viewport::Viewport;
pub use workspace::{Connection, ConnectionId, Workspace, WorkspaceId};
