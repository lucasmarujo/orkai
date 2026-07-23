use std::collections::HashMap;
use std::sync::Mutex;

use uuid::Uuid;

use crate::{PtyError, PtySession, Result};

/// Sessoes vivas indexadas pelo id do no do canvas.
///
/// Um `Mutex` global basta: as operacoes sao curtissimas (lookup + write) e a
/// concorrencia real e o numero de terminais abertos, nao milhares de threads.
#[derive(Default)]
pub struct PtyRegistry {
    sessions: Mutex<HashMap<Uuid, PtySession>>,
}

impl PtyRegistry {
    pub fn insert(&self, id: Uuid, session: PtySession) {
        self.sessions
            .lock()
            .expect("registry envenenado")
            .insert(id, session);
    }

    pub fn contains(&self, id: Uuid) -> bool {
        self.sessions
            .lock()
            .expect("registry envenenado")
            .contains_key(&id)
    }

    /// Executa `acao` sobre a sessao, mantendo o lock so durante a chamada.
    pub fn with<T>(&self, id: Uuid, acao: impl FnOnce(&PtySession) -> Result<T>) -> Result<T> {
        let sessions = self.sessions.lock().expect("registry envenenado");
        let session = sessions.get(&id).ok_or(PtyError::SessionNotFound(id))?;
        acao(session)
    }

    /// Remove a sessao; o `Drop` de [`PtySession`] mata o processo.
    pub fn remove(&self, id: Uuid) -> Result<()> {
        self.sessions
            .lock()
            .expect("registry envenenado")
            .remove(&id)
            .map(|_| ())
            .ok_or(PtyError::SessionNotFound(id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operacoes_em_id_desconhecido_falham_em_vez_de_entrar_em_panico() {
        let registry = PtyRegistry::default();
        let id = Uuid::new_v4();
        assert!(!registry.contains(id));
        assert!(matches!(
            registry.remove(id),
            Err(PtyError::SessionNotFound(_))
        ));
        assert!(matches!(
            registry.with(id, |_| Ok(())),
            Err(PtyError::SessionNotFound(_))
        ));
    }
}
