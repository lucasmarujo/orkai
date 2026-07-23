//! Barramento de mensagens entre agentes e o servidor de protocolo MCP.
//!
//! A regra central: a comunicacao entre agentes e mediada pela ACL do canvas — um
//! agente so ve e so fala com quem tem uma aresta com ele. A autorizacao vive no
//! [`McpContext`] (implementado sobre o workspace no app), e o protocolo a aplica em
//! todas as ferramentas. O transporte (HTTP) mora no app; aqui fica a logica pura.

mod bus;
mod context;
mod protocol;

pub use bus::{AgentBus, Message};
pub use context::{McpContext, Peer, PeerContent, PeerError};
pub use protocol::{handle_request, handle_request_with_clock};
