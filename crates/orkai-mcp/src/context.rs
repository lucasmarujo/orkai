use orkai_core::NodeId;

/// Um peer visivel para um agente: id e nome legivel.
#[derive(Debug, Clone, PartialEq)]
pub struct Peer {
    pub id: NodeId,
    pub name: String,
}

/// Conteudo legivel de um no vizinho.
///
/// O agente nao precisa saber o tipo do no de antemao: pede o conteudo e o Orkai
/// resolve — terminal devolve a saida, nota devolve o texto do arquivo.
#[derive(Debug, Clone, PartialEq)]
pub enum PeerContent {
    /// Saida recente do terminal (agente ou terminal).
    Terminal(String),
    /// Texto de uma nota markdown, com o caminho para o agente saber o que citou.
    Note { path: String, text: String },
}

/// Por que a leitura de um vizinho falhou.
///
/// Separar os dois casos importa: "sem aresta" e um problema de autorizacao que o
/// usuario resolve ligando os nos no canvas; "sem conteudo legivel" e uma propriedade
/// do no. Colapsar os dois num `None` fazia o agente receber "sem aresta" mesmo com a
/// aresta existindo — mensagem que mandava o usuario procurar o problema errado.
#[derive(Debug, Clone, PartialEq)]
pub enum PeerError {
    /// Nao ha aresta entre o chamador e o alvo.
    NotConnected,
    /// Ha aresta, mas o no nao tem conteudo legivel (frame, ou terminal sem sessao viva).
    NotReadable { kind: String },
    /// Ha aresta e o no aceita escrita, mas o disco recusou.
    WriteFailed { reason: String },
}

/// Visao que o servidor MCP tem do mundo, do ponto de vista de um agente.
///
/// Trait, nao struct concreta, por dois motivos: o app real implementa isto sobre o
/// workspace + registry de PTY, mas os testes do protocolo usam um fake — a ACL e a
/// entrega sao verificadas sem subir SQLite nem processo. Toda funcao recebe `caller`
/// (o agente que chamou a tool) e aplica a ACL a partir dele.
pub trait McpContext: Send + Sync {
    /// Nos ligados ao chamador por uma aresta. Fora desta lista, ninguem existe.
    fn peers(&self, caller: NodeId) -> Vec<Peer>;

    /// Ha aresta entre o chamador e o alvo? Porta de entrada do `send`.
    fn is_connected(&self, caller: NodeId, target: NodeId) -> bool;

    /// Conteudo de um vizinho. A ACL e checada aqui dentro, nao pelo chamador.
    fn peer_content(&self, caller: NodeId, target: NodeId) -> Result<PeerContent, PeerError>;

    /// Escreve numa nota vizinha e devolve o caminho do arquivo.
    ///
    /// Contrapartida do `peer_content`: com a leitura sozinha o agente so consome o que
    /// o humano escreveu; com a escrita a nota vira memoria compartilhada visivel no
    /// canvas — o artefato deixa de morrer no scrollback do terminal. `append` e o modo
    /// natural (varios agentes acumulando), `false` sobrescreve o arquivo inteiro.
    fn write_note(
        &self,
        caller: NodeId,
        target: NodeId,
        text: &str,
        append: bool,
    ) -> Result<String, PeerError>;

    /// Resolve um id a partir do que o agente digitou: aceita o UUID ou o nome do peer.
    /// So resolve entre os peers do chamador — nao da para mirar quem nao e vizinho.
    fn resolve_peer(&self, caller: NodeId, needle: &str) -> Option<NodeId> {
        let peers = self.peers(caller);
        if let Ok(id) = needle.parse::<NodeId>() {
            return peers.into_iter().find(|p| p.id == id).map(|p| p.id);
        }
        // Nome, case-insensitive. Ambiguo (dois peers com o mesmo nome) -> primeiro.
        peers
            .into_iter()
            .find(|p| p.name.eq_ignore_ascii_case(needle))
            .map(|p| p.id)
    }
}
