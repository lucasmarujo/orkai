use std::collections::HashMap;
use std::sync::Mutex;

use orkai_core::NodeId;
use serde::Serialize;

/// Uma mensagem entregue de um agente a outro.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub from: NodeId,
    pub text: String,
    /// Milissegundos desde a epoch Unix.
    pub at: i64,
}

/// Caixa de entrada por no.
///
/// A autorizacao (quem pode mandar para quem) NAO vive aqui — vive na ACL do workspace
/// (`are_connected`). O barramento so guarda e entrega; recusar por falta de aresta e
/// decisao de quem chama, testada no protocolo. Assim o barramento e uma estrutura de
/// dados burra e trivial de testar.
#[derive(Default)]
pub struct AgentBus {
    inboxes: Mutex<HashMap<NodeId, Vec<Message>>>,
}

/// Teto de mensagens por caixa. Um agente que nunca le nao pode crescer sem limite.
const MAX_INBOX: usize = 500;

impl AgentBus {
    pub fn new() -> Self {
        Self::default()
    }

    /// Enfileira uma mensagem para `to`. Descarta a mais antiga se a caixa encheu.
    pub fn deliver(&self, to: NodeId, message: Message) {
        let mut inboxes = self.inboxes.lock().expect("bus envenenado");
        let caixa = inboxes.entry(to).or_default();
        caixa.push(message);
        if caixa.len() > MAX_INBOX {
            caixa.remove(0);
        }
    }

    /// Le e esvazia a caixa de `node`. Ler consome: a proxima chamada nao repete.
    pub fn drain(&self, node: NodeId) -> Vec<Message> {
        self.inboxes
            .lock()
            .expect("bus envenenado")
            .remove(&node)
            .unwrap_or_default()
    }

    /// Quantas mensagens aguardam, sem consumir. Usado para o badge de inbox no canvas.
    pub fn pending(&self, node: NodeId) -> usize {
        self.inboxes
            .lock()
            .expect("bus envenenado")
            .get(&node)
            .map_or(0, Vec::len)
    }

    /// Descarta a caixa de um no removido, para nao vazar memoria.
    pub fn forget(&self, node: NodeId) {
        self.inboxes.lock().expect("bus envenenado").remove(&node);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(from: NodeId, texto: &str) -> Message {
        Message {
            from,
            text: texto.into(),
            at: 0,
        }
    }

    #[test]
    fn entrega_e_ler_esvazia() {
        let bus = AgentBus::new();
        let (a, b) = (NodeId::new_v4(), NodeId::new_v4());
        bus.deliver(b, msg(a, "ola"));
        bus.deliver(b, msg(a, "mundo"));

        assert_eq!(bus.pending(b), 2);
        let recebidas = bus.drain(b);
        assert_eq!(recebidas.len(), 2);
        assert_eq!(recebidas[0].text, "ola");
        assert_eq!(recebidas[1].text, "mundo");
        // Ler consome.
        assert!(bus.drain(b).is_empty());
        assert_eq!(bus.pending(b), 0);
    }

    #[test]
    fn caixa_de_no_sem_mensagens_e_vazia() {
        let bus = AgentBus::new();
        assert!(bus.drain(NodeId::new_v4()).is_empty());
        assert_eq!(bus.pending(NodeId::new_v4()), 0);
    }

    #[test]
    fn mensagens_de_remetentes_diferentes_convivem_na_ordem_de_chegada() {
        let bus = AgentBus::new();
        let (a, b, dest) = (NodeId::new_v4(), NodeId::new_v4(), NodeId::new_v4());
        bus.deliver(dest, msg(a, "de a"));
        bus.deliver(dest, msg(b, "de b"));
        let recebidas = bus.drain(dest);
        assert_eq!(recebidas[0].from, a);
        assert_eq!(recebidas[1].from, b);
    }

    #[test]
    fn caixa_cheia_descarta_a_mais_antiga() {
        let bus = AgentBus::new();
        let dest = NodeId::new_v4();
        for i in 0..(MAX_INBOX + 10) {
            bus.deliver(dest, msg(NodeId::new_v4(), &i.to_string()));
        }
        let recebidas = bus.drain(dest);
        assert_eq!(recebidas.len(), MAX_INBOX);
        // As 10 primeiras cairam; a caixa comeca em "10".
        assert_eq!(recebidas[0].text, "10");
    }

    #[test]
    fn forget_limpa_a_caixa() {
        let bus = AgentBus::new();
        let node = NodeId::new_v4();
        bus.deliver(node, msg(NodeId::new_v4(), "x"));
        bus.forget(node);
        assert_eq!(bus.pending(node), 0);
    }
}
