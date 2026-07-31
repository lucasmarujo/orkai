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
    /// A operacao chegou ao alvo certo, mas o sistema recusou: binario ausente, processo
    /// que nao subiu, banco indisponivel. Nao e autorizacao nem tipo de no.
    Failed { reason: String },
}

/// Em que ponto do trabalho esta um no vizinho.
///
/// Espelha o que a camada de atencao do app deduz do processo. Existe aqui, e nao la,
/// porque e o vocabulario que o supervisor le pela ferramenta — o app traduz o dele
/// para este. `Unknown` cobre o que nao tem processo (nota, frame) ou nunca rodou.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PeerState {
    /// Produzindo saida agora: esta no meio de um turno.
    Running,
    /// Parado numa pergunta, esperando uma decisao.
    Waiting,
    /// Calado ha um tempo, sem pergunta na tela: terminou o turno.
    Idle,
    /// Processo encerrado.
    Exited,
    /// No sem processo (nota, frame) ou agente que nunca foi iniciado.
    Unknown,
}

impl PeerState {
    /// Rotulo curto usado na resposta da ferramenta.
    pub fn label(self) -> &'static str {
        match self {
            Self::Running => "executando",
            Self::Waiting => "aguardando decisao",
            Self::Idle => "ocioso (turno concluido)",
            Self::Exited => "encerrado",
            Self::Unknown => "sem processo",
        }
    }
}

/// Um vizinho com o estado do trabalho dele. E o que o supervisor consulta para saber
/// quem terminou, quem travou e quem ainda esta produzindo.
#[derive(Debug, Clone, PartialEq)]
pub struct PeerStatus {
    pub peer: Peer,
    /// Tipo do no (`agent`, `markdown`, `terminal`...), como no `NodeKind::tag`.
    pub kind: String,
    pub state: PeerState,
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

    /// Estado de cada vizinho do chamador. Mesma ACL do `peers`: fora da vizinhanca
    /// ninguem existe, entao ninguem e observavel.
    fn peer_statuses(&self, caller: NodeId) -> Vec<PeerStatus>;

    /// Cria um agente novo ligado ao chamador e ja com o processo rodando.
    ///
    /// A aresta com o criador nasce junto de proposito: e ela que autoriza o dialogo
    /// entre os dois. Um agente criado sem aresta seria um processo que o supervisor
    /// nao pode nem consultar nem instruir.
    fn spawn_agent(
        &self,
        caller: NodeId,
        name: &str,
        role: &str,
        system_prompt: &str,
    ) -> Result<Peer, PeerError>;

    /// Encerra o processo de um agente vizinho. O no continua no canvas com o
    /// transcript: matar o processo e reversivel, apagar a conversa nao.
    fn stop_agent(&self, caller: NodeId, target: NodeId) -> Result<(), PeerError>;

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
