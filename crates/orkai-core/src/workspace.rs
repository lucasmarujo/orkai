use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{DomainError, Node, NodeId, Result, Viewport};

pub type WorkspaceId = Uuid;
pub type ConnectionId = Uuid;

/// Aresta entre dois nos. Sem semantica no M1: so existe e e desenhada.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: ConnectionId,
    pub from: NodeId,
    pub to: NodeId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: WorkspaceId,
    pub name: String,
    pub viewport: Viewport,
    pub nodes: Vec<Node>,
    pub connections: Vec<Connection>,
}

impl Workspace {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            viewport: Viewport::default(),
            nodes: Vec::new(),
            connections: Vec::new(),
        }
    }

    pub fn node(&self, id: NodeId) -> Result<&Node> {
        self.nodes
            .iter()
            .find(|n| n.id == id)
            .ok_or_else(|| DomainError::NodeNotFound(id.to_string()))
    }

    /// Insere ou substitui um no pelo id.
    pub fn upsert_node(&mut self, node: Node) {
        match self.nodes.iter_mut().find(|n| n.id == node.id) {
            Some(existente) => *existente = node,
            None => self.nodes.push(node),
        }
    }

    /// Remove o no e toda conexao que o referencia, evitando arestas orfas.
    pub fn remove_node(&mut self, id: NodeId) -> Result<Node> {
        let pos = self
            .nodes
            .iter()
            .position(|n| n.id == id)
            .ok_or_else(|| DomainError::NodeNotFound(id.to_string()))?;
        self.connections.retain(|c| c.from != id && c.to != id);
        Ok(self.nodes.remove(pos))
    }

    /// Adiciona uma aresta, devolvendo `None` quando ela nao faz sentido.
    ///
    /// Rejeita laco no proprio no e duplicata na mesma direcao — a UI de arrastar
    /// handle produz os dois com facilidade.
    pub fn add_connection(&mut self, from: NodeId, to: NodeId) -> Option<Connection> {
        if from == to || self.nodes.iter().all(|n| n.id != from) {
            return None;
        }
        if self.nodes.iter().all(|n| n.id != to) {
            return None;
        }
        if self
            .connections
            .iter()
            .any(|c| c.from == from && c.to == to)
        {
            return None;
        }

        let connection = Connection {
            id: Uuid::new_v4(),
            from,
            to,
        };
        self.connections.push(connection.clone());
        Some(connection)
    }

    pub fn remove_connection(&mut self, id: ConnectionId) -> Result<Connection> {
        let pos = self
            .connections
            .iter()
            .position(|c| c.id == id)
            .ok_or_else(|| DomainError::ConnectionNotFound(id.to_string()))?;
        Ok(self.connections.remove(pos))
    }

    /// Arestas que tocam o no — usadas para desfazer a exclusao dele por inteiro.
    pub fn connections_of(&self, id: NodeId) -> Vec<Connection> {
        self.connections
            .iter()
            .filter(|c| c.from == id || c.to == id)
            .cloned()
            .collect()
    }

    /// Nos ligados a este por uma aresta, em qualquer direcao.
    ///
    /// E a ACL da comunicacao entre agentes: um agente so ve e so fala com quem tem
    /// aresta com ele. Sem aresta, nao existe canal. A direcao da conexao nao restringe
    /// o dialogo — ligar A a B autoriza os dois sentidos.
    pub fn peers_of(&self, id: NodeId) -> Vec<NodeId> {
        let mut peers: Vec<NodeId> = self
            .connections
            .iter()
            .filter_map(|c| {
                if c.from == id {
                    Some(c.to)
                } else if c.to == id {
                    Some(c.from)
                } else {
                    None
                }
            })
            .collect();
        // Duas arestas entre os mesmos nos nao viram dois peers.
        peers.sort();
        peers.dedup();
        peers
    }

    /// Ha um canal autorizado entre os dois nos? Pergunta central do `orkai_send`.
    pub fn are_connected(&self, a: NodeId, b: NodeId) -> bool {
        self.connections
            .iter()
            .any(|c| (c.from == a && c.to == b) || (c.from == b && c.to == a))
    }

    /// Proximo `z_index` livre, para o no recem-criado ficar por cima.
    pub fn next_z_index(&self) -> i32 {
        self.nodes
            .iter()
            .map(|n| n.z_index)
            .max()
            .map_or(0, |max| max + 1)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::{NodeKind, Size, Vec2};

    fn no(id: Uuid, z: i32) -> Node {
        Node {
            id,
            kind: NodeKind::Markdown {
                file_path: PathBuf::from("a.md"),
                color: String::new(),
            },
            position: Vec2::ZERO,
            size: Size::new(200.0, 200.0).unwrap(),
            z_index: z,
            created_at: 0,
        }
    }

    #[test]
    fn upsert_substitui_em_vez_de_duplicar() {
        let mut ws = Workspace::new("t");
        let id = Uuid::new_v4();
        ws.upsert_node(no(id, 0));
        ws.upsert_node(no(id, 7));
        assert_eq!(ws.nodes.len(), 1);
        assert_eq!(ws.node(id).unwrap().z_index, 7);
    }

    #[test]
    fn remover_no_derruba_conexoes_que_o_referenciam() {
        let mut ws = Workspace::new("t");
        let (a, b) = (Uuid::new_v4(), Uuid::new_v4());
        ws.upsert_node(no(a, 0));
        ws.upsert_node(no(b, 1));
        ws.connections.push(Connection {
            id: Uuid::new_v4(),
            from: a,
            to: b,
        });

        ws.remove_node(a).unwrap();
        assert!(ws.connections.is_empty());
        assert!(ws.node(a).is_err());
        assert!(ws.node(b).is_ok());
    }

    #[test]
    fn remover_no_inexistente_falha() {
        let mut ws = Workspace::new("t");
        assert!(ws.remove_node(Uuid::new_v4()).is_err());
    }

    #[test]
    fn add_connection_liga_dois_nos() {
        let mut ws = Workspace::new("t");
        let (a, b) = (Uuid::new_v4(), Uuid::new_v4());
        ws.upsert_node(no(a, 0));
        ws.upsert_node(no(b, 1));

        let conexao = ws.add_connection(a, b).expect("deveria criar");
        assert_eq!((conexao.from, conexao.to), (a, b));
        assert_eq!(ws.connections.len(), 1);
    }

    #[test]
    fn add_connection_rejeita_laco_duplicata_e_no_inexistente() {
        let mut ws = Workspace::new("t");
        let (a, b) = (Uuid::new_v4(), Uuid::new_v4());
        ws.upsert_node(no(a, 0));
        ws.upsert_node(no(b, 1));
        ws.add_connection(a, b);

        assert!(ws.add_connection(a, a).is_none(), "laco no proprio no");
        assert!(
            ws.add_connection(a, b).is_none(),
            "duplicata na mesma direcao"
        );
        assert!(
            ws.add_connection(a, Uuid::new_v4()).is_none(),
            "destino inexistente"
        );
        assert!(
            ws.add_connection(Uuid::new_v4(), b).is_none(),
            "origem inexistente"
        );
        assert_eq!(ws.connections.len(), 1);
    }

    #[test]
    fn add_connection_aceita_a_volta_como_aresta_propria() {
        let mut ws = Workspace::new("t");
        let (a, b) = (Uuid::new_v4(), Uuid::new_v4());
        ws.upsert_node(no(a, 0));
        ws.upsert_node(no(b, 1));
        ws.add_connection(a, b);

        assert!(ws.add_connection(b, a).is_some(), "b->a e outra direcao");
        assert_eq!(ws.connections.len(), 2);
    }

    #[test]
    fn remove_connection_falha_em_id_desconhecido() {
        let mut ws = Workspace::new("t");
        assert!(ws.remove_connection(Uuid::new_v4()).is_err());
    }

    #[test]
    fn connections_of_traz_as_duas_direcoes() {
        let mut ws = Workspace::new("t");
        let (a, b, c) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        for (i, id) in [a, b, c].iter().enumerate() {
            ws.upsert_node(no(*id, i as i32));
        }
        ws.add_connection(a, b);
        ws.add_connection(c, a);
        ws.add_connection(b, c);

        assert_eq!(ws.connections_of(a).len(), 2);
    }

    #[test]
    fn peers_of_traz_vizinhos_em_ambas_direcoes_sem_duplicar() {
        let mut ws = Workspace::new("t");
        let (a, b, c, solto) = (
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
        );
        for (i, id) in [a, b, c, solto].iter().enumerate() {
            ws.upsert_node(no(*id, i as i32));
        }
        ws.add_connection(a, b); // a fala com b
        ws.add_connection(c, a); // e com c (direcao inversa)
        ws.add_connection(b, a); // aresta redundante: nao vira peer novo

        let mut peers = ws.peers_of(a);
        peers.sort();
        let mut esperado = vec![b, c];
        esperado.sort();
        assert_eq!(peers, esperado);
        // Sem aresta, sem canal: o no solto nao ve ninguem.
        assert!(ws.peers_of(solto).is_empty());
    }

    #[test]
    fn are_connected_e_a_acl_do_send() {
        let mut ws = Workspace::new("t");
        let (a, b, c) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        for (i, id) in [a, b, c].iter().enumerate() {
            ws.upsert_node(no(*id, i as i32));
        }
        ws.add_connection(a, b);

        assert!(ws.are_connected(a, b), "aresta autoriza a->b");
        assert!(ws.are_connected(b, a), "e o sentido inverso");
        assert!(!ws.are_connected(a, c), "sem aresta, sem canal");
    }

    #[test]
    fn next_z_index_fica_acima_do_maior() {
        let mut ws = Workspace::new("t");
        assert_eq!(ws.next_z_index(), 0);
        ws.upsert_node(no(Uuid::new_v4(), 5));
        assert_eq!(ws.next_z_index(), 6);
    }
}
