use serde_json::{json, Value};

use orkai_core::NodeId;

use crate::bus::{AgentBus, Message};
use crate::context::{McpContext, PeerContent, PeerError};

/// Versao do protocolo MCP que anunciamos no `initialize`.
const PROTOCOL_VERSION: &str = "2024-11-05";

/// Milissegundos desde a epoch, injetavel para o teste ser deterministico.
pub type Clock = fn() -> i64;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Processa uma requisicao JSON-RPC vinda de um agente.
///
/// `caller` e o no cujo processo abriu esta conexao — o transporte HTTP o identifica
/// por um header, e e nele que toda a ACL se apoia. Devolve `None` para notificacoes
/// (sem `id`), que nao tem resposta.
pub fn handle_request(
    caller: NodeId,
    request: &Value,
    ctx: &dyn McpContext,
    bus: &AgentBus,
) -> Option<Value> {
    handle_request_with_clock(caller, request, ctx, bus, now_ms)
}

pub fn handle_request_with_clock(
    caller: NodeId,
    request: &Value,
    ctx: &dyn McpContext,
    bus: &AgentBus,
    clock: Clock,
) -> Option<Value> {
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    // Notificacao: sem id, sem resposta. `initialized` e a unica que esperamos.
    let id = request.get("id").cloned()?;

    let resultado = match method {
        "initialize" => Ok(json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "orkai", "version": env!("CARGO_PKG_VERSION") },
        })),
        "tools/list" => Ok(json!({ "tools": tool_definitions() })),
        "tools/call" => handle_tool_call(caller, request, ctx, bus, clock),
        outro => Err(RpcError::method_not_found(outro)),
    };

    Some(match resultado {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err(erro) => json!({ "jsonrpc": "2.0", "id": id, "error": erro.to_json() }),
    })
}

fn handle_tool_call(
    caller: NodeId,
    request: &Value,
    ctx: &dyn McpContext,
    bus: &AgentBus,
    clock: Clock,
) -> Result<Value, RpcError> {
    let params = request.get("params").cloned().unwrap_or(json!({}));
    let nome = params
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let args = params.get("arguments").cloned().unwrap_or(json!({}));

    match nome {
        "orkai_list_peers" => Ok(tool_text(list_peers(caller, ctx))),
        "orkai_inbox" => Ok(tool_text(inbox(caller, bus))),
        "orkai_send" => send(caller, &args, ctx, bus, clock).map(tool_text),
        "orkai_read_peer_output" => read_peer_output(caller, &args, ctx).map(tool_text),
        "orkai_note" => write_note(caller, &args, ctx).map(tool_text),
        outro => Err(RpcError::invalid_params(&format!(
            "ferramenta desconhecida: {outro}"
        ))),
    }
}

// ---------------------------------------------------------------- ferramentas

fn list_peers(caller: NodeId, ctx: &dyn McpContext) -> String {
    let peers = ctx.peers(caller);
    if peers.is_empty() {
        return "Nenhum agente conectado. Ligue uma aresta no canvas para abrir um canal.".into();
    }
    let linhas: Vec<String> = peers
        .iter()
        .map(|p| format!("- {} (id: {})", p.name, p.id))
        .collect();
    format!("Agentes conectados a voce:\n{}", linhas.join("\n"))
}

fn inbox(caller: NodeId, bus: &AgentBus) -> String {
    let mensagens = bus.drain(caller);
    if mensagens.is_empty() {
        return "Caixa de entrada vazia.".into();
    }
    let linhas: Vec<String> = mensagens
        .iter()
        .map(|m| format!("De {}: {}", m.from, m.text))
        .collect();
    format!("{} mensagem(ns):\n{}", mensagens.len(), linhas.join("\n"))
}

fn send(
    caller: NodeId,
    args: &Value,
    ctx: &dyn McpContext,
    bus: &AgentBus,
    clock: Clock,
) -> Result<String, RpcError> {
    let alvo = args.get("to").and_then(Value::as_str).unwrap_or_default();
    let texto = args
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if texto.is_empty() {
        return Err(RpcError::invalid_params("mensagem vazia"));
    }

    let destino = ctx
        .resolve_peer(caller, alvo)
        .ok_or_else(|| RpcError::invalid_params(&format!("peer nao encontrado: {alvo}")))?;

    // A ACL: mesmo com id valido, sem aresta nao ha canal. resolve_peer ja filtra por
    // vizinhanca, mas a checagem explicita documenta a regra e protege contra um
    // resolve_peer futuro mais permissivo.
    if !ctx.is_connected(caller, destino) {
        return Err(RpcError::forbidden(
            "sem aresta com esse agente: ligue os nos no canvas primeiro",
        ));
    }

    bus.deliver(
        destino,
        Message {
            from: caller,
            text: texto.to_string(),
            at: clock(),
        },
    );
    Ok(format!("Mensagem entregue a {destino}."))
}

fn read_peer_output(
    caller: NodeId,
    args: &Value,
    ctx: &dyn McpContext,
) -> Result<String, RpcError> {
    let alvo = args.get("peer").and_then(Value::as_str).unwrap_or_default();
    let destino = ctx
        .resolve_peer(caller, alvo)
        .ok_or_else(|| RpcError::invalid_params(&format!("peer nao encontrado: {alvo}")))?;

    match ctx.peer_content(caller, destino) {
        Ok(PeerContent::Terminal(saida)) => Ok(saida),
        // O caminho vai junto para o agente poder citar a fonte do que leu.
        Ok(PeerContent::Note { path, text }) => Ok(format!("Nota {path}:\n{text}")),
        Err(PeerError::NotConnected) => Err(RpcError::forbidden(
            "sem aresta com esse no: ligue os nos no canvas primeiro",
        )),
        Err(PeerError::NotReadable { kind }) => Err(RpcError::invalid_params(&format!(
            "o no e do tipo '{kind}' e nao tem conteudo legivel"
        ))),
        // Leitura nao escreve; so existe para o match ficar exaustivo.
        Err(PeerError::WriteFailed { reason }) => Err(RpcError::internal(&reason)),
    }
}

fn write_note(caller: NodeId, args: &Value, ctx: &dyn McpContext) -> Result<String, RpcError> {
    let alvo = args.get("note").and_then(Value::as_str).unwrap_or_default();
    let texto = args.get("text").and_then(Value::as_str).unwrap_or_default();
    if texto.is_empty() {
        return Err(RpcError::invalid_params("texto vazio"));
    }
    // Append e o padrao: sobrescrever a nota do humano por engano e o pior erro possivel
    // aqui, entao destruir conteudo exige o agente pedir explicitamente.
    let append = match args.get("mode").and_then(Value::as_str).unwrap_or("append") {
        "append" => true,
        "replace" => false,
        outro => {
            return Err(RpcError::invalid_params(&format!(
                "mode invalido: {outro} (use 'append' ou 'replace')"
            )))
        }
    };

    let destino = ctx
        .resolve_peer(caller, alvo)
        .ok_or_else(|| RpcError::invalid_params(&format!("nota nao encontrada: {alvo}")))?;

    match ctx.write_note(caller, destino, texto, append) {
        Ok(caminho) => Ok(format!("Nota {caminho} atualizada.")),
        Err(PeerError::NotConnected) => Err(RpcError::forbidden(
            "sem aresta com essa nota: ligue os nos no canvas primeiro",
        )),
        Err(PeerError::NotReadable { kind }) => Err(RpcError::invalid_params(&format!(
            "o no e do tipo '{kind}': orkai_note so escreve em notas markdown"
        ))),
        Err(PeerError::WriteFailed { reason }) => Err(RpcError::internal(&format!(
            "falha ao gravar a nota: {reason}"
        ))),
    }
}

// ---------------------------------------------------------------- definicoes

/// Esquema das ferramentas expostas ao agente. `read_peer_output` e as demais entram
/// juntas; no M4a todas ja existem no protocolo, so a UI de semantica de aresta e M4b.
fn tool_definitions() -> Value {
    json!([
        {
            "name": "orkai_list_peers",
            "description": "Lista os agentes conectados a voce por uma aresta no canvas do Orkai.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "orkai_send",
            "description": "Envia uma mensagem de texto a um agente conectado. So funciona se houver uma aresta entre os nos.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "to": { "type": "string", "description": "Nome ou id do agente de destino" },
                    "message": { "type": "string", "description": "O texto a enviar" }
                },
                "required": ["to", "message"]
            }
        },
        {
            "name": "orkai_inbox",
            "description": "Le e esvazia sua caixa de entrada: mensagens enviadas por outros agentes.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "orkai_read_peer_output",
            "description": "Le o conteudo de um no conectado a voce: a saida recente do terminal (agente ou terminal) ou o texto de uma nota markdown. Use para ver o plano, o spec ou o progresso de um vizinho.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "peer": { "type": "string", "description": "Nome ou id do no conectado (agente, terminal ou nota)" }
                },
                "required": ["peer"]
            }
        },
        {
            "name": "orkai_note",
            "description": "Escreve numa nota markdown conectada a voce: plano, spec, decisao ou resultado. A nota fica visivel no canvas e outros agentes conectados a ela podem ler. Use para deixar o artefato registrado em vez de so responder no terminal.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "note": { "type": "string", "description": "Nome ou id da nota conectada" },
                    "text": { "type": "string", "description": "O markdown a gravar" },
                    "mode": {
                        "type": "string",
                        "enum": ["append", "replace"],
                        "description": "append (padrao) acrescenta ao fim; replace troca a nota inteira"
                    }
                },
                "required": ["note", "text"]
            }
        }
    ])
}

/// Empacota texto no formato de resultado de tool do MCP.
fn tool_text(texto: String) -> Value {
    json!({ "content": [{ "type": "text", "text": texto }] })
}

// ---------------------------------------------------------------- erros

struct RpcError {
    code: i32,
    message: String,
}

impl RpcError {
    fn method_not_found(method: &str) -> Self {
        Self {
            code: -32601,
            message: format!("metodo nao encontrado: {method}"),
        }
    }
    fn invalid_params(msg: &str) -> Self {
        Self {
            code: -32602,
            message: msg.into(),
        }
    }
    /// Sem codigo padrao JSON-RPC para "proibido"; usamos a faixa reservada a servidor.
    fn forbidden(msg: &str) -> Self {
        Self {
            code: -32000,
            message: msg.into(),
        }
    }
    fn internal(msg: &str) -> Self {
        Self {
            code: -32603,
            message: msg.into(),
        }
    }
    fn to_json(&self) -> Value {
        json!({ "code": self.code, "message": self.message })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::Peer;

    const RELOGIO: Clock = || 12345;

    /// Contexto falso: peers por chamador e o conteudo de cada no. Sem workspace, sem PTY.
    struct FakeCtx {
        peers: Vec<(NodeId, Peer)>,
        conteudos: Vec<(NodeId, PeerContent)>,
    }

    impl McpContext for FakeCtx {
        fn peers(&self, caller: NodeId) -> Vec<Peer> {
            self.peers
                .iter()
                .filter(|(dono, _)| *dono == caller)
                .map(|(_, p)| p.clone())
                .collect()
        }
        fn is_connected(&self, caller: NodeId, target: NodeId) -> bool {
            self.peers(caller).iter().any(|p| p.id == target)
        }
        fn peer_content(&self, caller: NodeId, target: NodeId) -> Result<PeerContent, PeerError> {
            if !self.is_connected(caller, target) {
                return Err(PeerError::NotConnected);
            }
            self.conteudos
                .iter()
                .find(|(id, _)| *id == target)
                .map(|(_, c)| c.clone())
                .ok_or(PeerError::NotReadable {
                    kind: "frame".into(),
                })
        }
        fn write_note(
            &self,
            caller: NodeId,
            target: NodeId,
            _text: &str,
            append: bool,
        ) -> Result<String, PeerError> {
            match self.peer_content(caller, target)? {
                // O fake devolve o modo junto do caminho: e o unico jeito de o teste do
                // protocolo afirmar qual modo foi repassado sem dar estado mutavel a ele.
                PeerContent::Note { path, .. } => Ok(format!("{path} (append={append})")),
                PeerContent::Terminal(_) => Err(PeerError::NotReadable {
                    kind: "terminal".into(),
                }),
            }
        }
    }

    fn call(caller: NodeId, name: &str, args: Value, ctx: &FakeCtx, bus: &AgentBus) -> Value {
        let req = json!({
            "jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": { "name": name, "arguments": args }
        });
        handle_request_with_clock(caller, &req, ctx, bus, RELOGIO).unwrap()
    }

    fn texto(resposta: &Value) -> String {
        resposta["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .to_string()
    }

    #[test]
    fn initialize_anuncia_o_servidor() {
        let (ctx, bus) = (
            FakeCtx {
                peers: vec![],
                conteudos: vec![],
            },
            AgentBus::new(),
        );
        let req = json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize" });
        let resp = handle_request(NodeId::new_v4(), &req, &ctx, &bus).unwrap();
        assert_eq!(resp["result"]["serverInfo"]["name"], "orkai");
    }

    #[test]
    fn notificacao_nao_tem_resposta() {
        let (ctx, bus) = (
            FakeCtx {
                peers: vec![],
                conteudos: vec![],
            },
            AgentBus::new(),
        );
        let req = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
        assert!(handle_request(NodeId::new_v4(), &req, &ctx, &bus).is_none());
    }

    #[test]
    fn tools_list_traz_todas_as_ferramentas() {
        let (ctx, bus) = (
            FakeCtx {
                peers: vec![],
                conteudos: vec![],
            },
            AgentBus::new(),
        );
        let req = json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/list" });
        let resp = handle_request(NodeId::new_v4(), &req, &ctx, &bus).unwrap();
        let nomes: Vec<&str> = resp["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(nomes.len(), 5);
        assert!(nomes.contains(&"orkai_send"));
        assert!(nomes.contains(&"orkai_read_peer_output"));
        assert!(nomes.contains(&"orkai_note"));
    }

    /// Contexto com um agente `a` ligado a uma nota.
    fn ctx_com_nota(a: NodeId, nota: NodeId) -> FakeCtx {
        FakeCtx {
            peers: vec![(
                a,
                Peer {
                    id: nota,
                    name: "Plano".into(),
                },
            )],
            conteudos: vec![(
                nota,
                PeerContent::Note {
                    path: "plano.md".into(),
                    text: "# Plano".into(),
                },
            )],
        }
    }

    #[test]
    fn note_escreve_em_nota_conectada_em_modo_append() {
        let (a, nota) = (NodeId::new_v4(), NodeId::new_v4());
        let ctx = ctx_com_nota(a, nota);
        let bus = AgentBus::new();

        let resp = call(
            a,
            "orkai_note",
            json!({ "note": "Plano", "text": "## Decisao" }),
            &ctx,
            &bus,
        );
        assert!(texto(&resp).contains("plano.md (append=true)"), "{resp}");
    }

    #[test]
    fn note_aceita_replace_e_recusa_modo_desconhecido() {
        let (a, nota) = (NodeId::new_v4(), NodeId::new_v4());
        let ctx = ctx_com_nota(a, nota);
        let bus = AgentBus::new();

        let resp = call(
            a,
            "orkai_note",
            json!({ "note": "Plano", "text": "x", "mode": "replace" }),
            &ctx,
            &bus,
        );
        assert!(texto(&resp).contains("append=false"), "{resp}");

        let resp = call(
            a,
            "orkai_note",
            json!({ "note": "Plano", "text": "x", "mode": "anexar" }),
            &ctx,
            &bus,
        );
        assert_eq!(resp["error"]["code"], -32602);
    }

    #[test]
    fn note_sem_aresta_nao_encontra_a_nota() {
        let (a, nota) = (NodeId::new_v4(), NodeId::new_v4());
        // Nota existe no mundo, mas nao e peer de `a`: sem aresta, nao existe para ele.
        let ctx = FakeCtx {
            peers: vec![],
            conteudos: vec![(
                nota,
                PeerContent::Note {
                    path: "plano.md".into(),
                    text: String::new(),
                },
            )],
        };
        let resp = call(
            a,
            "orkai_note",
            json!({ "note": nota.to_string(), "text": "x" }),
            &ctx,
            &AgentBus::new(),
        );
        assert_eq!(resp["error"]["code"], -32602);
    }

    #[test]
    fn note_recusa_no_que_nao_e_nota() {
        let (a, term) = (NodeId::new_v4(), NodeId::new_v4());
        let ctx = FakeCtx {
            peers: vec![(
                a,
                Peer {
                    id: term,
                    name: "Terminal".into(),
                },
            )],
            conteudos: vec![(term, PeerContent::Terminal("saida".into()))],
        };
        let resp = call(
            a,
            "orkai_note",
            json!({ "note": "Terminal", "text": "x" }),
            &ctx,
            &AgentBus::new(),
        );
        assert!(
            resp["error"]["message"]
                .as_str()
                .unwrap()
                .contains("so escreve em notas markdown"),
            "{resp}"
        );
    }

    #[test]
    fn note_recusa_texto_vazio() {
        let (a, nota) = (NodeId::new_v4(), NodeId::new_v4());
        let ctx = ctx_com_nota(a, nota);
        let resp = call(
            a,
            "orkai_note",
            json!({ "note": "Plano", "text": "" }),
            &ctx,
            &AgentBus::new(),
        );
        assert_eq!(resp["error"]["code"], -32602);
    }

    #[test]
    fn send_entrega_a_peer_conectado() {
        let (a, b) = (NodeId::new_v4(), NodeId::new_v4());
        let ctx = FakeCtx {
            peers: vec![(
                a,
                Peer {
                    id: b,
                    name: "Bravo".into(),
                },
            )],
            conteudos: vec![],
        };
        let bus = AgentBus::new();

        let resp = call(
            a,
            "orkai_send",
            json!({ "to": "Bravo", "message": "oi" }),
            &ctx,
            &bus,
        );
        assert!(texto(&resp).contains("entregue"));

        let recebidas = bus.drain(b);
        assert_eq!(recebidas.len(), 1);
        assert_eq!(recebidas[0].from, a);
        assert_eq!(recebidas[0].text, "oi");
        assert_eq!(recebidas[0].at, 12345, "usa o relogio injetado");
    }

    #[test]
    fn send_para_quem_nao_tem_aresta_e_recusado() {
        // A GARANTIA CENTRAL DO M4a: sem aresta, send falha e nada e entregue.
        let (a, estranho) = (NodeId::new_v4(), NodeId::new_v4());
        let ctx = FakeCtx {
            peers: vec![],
            conteudos: vec![],
        };
        let bus = AgentBus::new();

        let resp = call(
            a,
            "orkai_send",
            json!({ "to": estranho.to_string(), "message": "oi" }),
            &ctx,
            &bus,
        );
        assert_eq!(
            resp["error"]["code"], -32602,
            "peer nem aparece: nao resolve"
        );
        assert!(bus.drain(estranho).is_empty(), "nada foi entregue");
    }

    #[test]
    fn send_por_nome_e_por_id_funcionam() {
        let (a, b) = (NodeId::new_v4(), NodeId::new_v4());
        let ctx = FakeCtx {
            peers: vec![(
                a,
                Peer {
                    id: b,
                    name: "Bravo".into(),
                },
            )],
            conteudos: vec![],
        };
        let bus = AgentBus::new();

        call(
            a,
            "orkai_send",
            json!({ "to": "bravo", "message": "por nome" }),
            &ctx,
            &bus,
        );
        call(
            a,
            "orkai_send",
            json!({ "to": b.to_string(), "message": "por id" }),
            &ctx,
            &bus,
        );
        assert_eq!(bus.drain(b).len(), 2);
    }

    #[test]
    fn inbox_le_e_esvazia() {
        let (a, b) = (NodeId::new_v4(), NodeId::new_v4());
        let ctx = FakeCtx {
            peers: vec![(
                a,
                Peer {
                    id: b,
                    name: "Bravo".into(),
                },
            )],
            conteudos: vec![],
        };
        let bus = AgentBus::new();
        call(
            a,
            "orkai_send",
            json!({ "to": "Bravo", "message": "oi" }),
            &ctx,
            &bus,
        );

        let resp = call(b, "orkai_inbox", json!({}), &ctx, &bus);
        assert!(texto(&resp).contains("oi"));
        // Esvaziou.
        let resp2 = call(b, "orkai_inbox", json!({}), &ctx, &bus);
        assert!(texto(&resp2).contains("vazia"));
    }

    #[test]
    fn list_peers_mostra_so_os_vizinhos() {
        let (a, b) = (NodeId::new_v4(), NodeId::new_v4());
        let ctx = FakeCtx {
            peers: vec![(
                a,
                Peer {
                    id: b,
                    name: "Bravo".into(),
                },
            )],
            conteudos: vec![],
        };
        let bus = AgentBus::new();

        assert!(texto(&call(a, "orkai_list_peers", json!({}), &ctx, &bus)).contains("Bravo"));
        // Quem nao tem aresta nao ve ninguem.
        let outro = NodeId::new_v4();
        assert!(texto(&call(outro, "orkai_list_peers", json!({}), &ctx, &bus)).contains("Nenhum"));
    }

    #[test]
    fn read_peer_output_respeita_a_acl() {
        let (a, b, estranho) = (NodeId::new_v4(), NodeId::new_v4(), NodeId::new_v4());
        let ctx = FakeCtx {
            peers: vec![(
                a,
                Peer {
                    id: b,
                    name: "Bravo".into(),
                },
            )],
            conteudos: vec![(b, PeerContent::Terminal("saida do terminal de b".into()))],
        };
        let bus = AgentBus::new();

        let ok = call(
            a,
            "orkai_read_peer_output",
            json!({ "peer": "Bravo" }),
            &ctx,
            &bus,
        );
        assert!(texto(&ok).contains("saida do terminal de b"));

        // Sem aresta, nem resolve.
        let negado = call(
            a,
            "orkai_read_peer_output",
            json!({ "peer": estranho.to_string() }),
            &ctx,
            &bus,
        );
        assert_eq!(negado["error"]["code"], -32602);
    }

    #[test]
    fn le_o_conteudo_de_uma_nota_conectada() {
        // A lacuna que o usuario apontou: nota ligada a um agente nao era legivel.
        let (agente, nota) = (NodeId::new_v4(), NodeId::new_v4());
        let ctx = FakeCtx {
            peers: vec![(
                agente,
                Peer {
                    id: nota,
                    name: "plano.md".into(),
                },
            )],
            conteudos: vec![(
                nota,
                PeerContent::Note {
                    path: "notas/plano.md".into(),
                    text: "# Plano\n1. Migrar o banco".into(),
                },
            )],
        };

        let resp = call(
            agente,
            "orkai_read_peer_output",
            json!({ "peer": "plano.md" }),
            &ctx,
            &AgentBus::new(),
        );
        let saida = texto(&resp);
        assert!(saida.contains("Migrar o banco"), "conteudo da nota");
        assert!(saida.contains("notas/plano.md"), "cita o caminho da fonte");
    }

    #[test]
    fn distingue_sem_aresta_de_sem_conteudo_legivel() {
        // Antes os dois casos viravam "sem aresta", mandando o usuario procurar o
        // problema errado quando a aresta existia.
        let (a, frame) = (NodeId::new_v4(), NodeId::new_v4());
        let ctx = FakeCtx {
            peers: vec![(
                a,
                Peer {
                    id: frame,
                    name: "Grupo".into(),
                },
            )],
            // Conectado, mas sem conteudo: o fake devolve NotReadable.
            conteudos: vec![],
        };

        let resp = call(
            a,
            "orkai_read_peer_output",
            json!({ "peer": "Grupo" }),
            &ctx,
            &AgentBus::new(),
        );
        assert_eq!(resp["error"]["code"], -32602, "nao e erro de autorizacao");
        let msg = resp["error"]["message"].as_str().unwrap();
        assert!(msg.contains("frame"), "diz o tipo do no: {msg}");
        assert!(!msg.contains("aresta"), "nao culpa a aresta: {msg}");
    }

    #[test]
    fn send_sem_mensagem_falha() {
        let (a, b) = (NodeId::new_v4(), NodeId::new_v4());
        let ctx = FakeCtx {
            peers: vec![(
                a,
                Peer {
                    id: b,
                    name: "Bravo".into(),
                },
            )],
            conteudos: vec![],
        };
        let bus = AgentBus::new();
        let resp = call(
            a,
            "orkai_send",
            json!({ "to": "Bravo", "message": "" }),
            &ctx,
            &bus,
        );
        assert_eq!(resp["error"]["code"], -32602);
    }

    #[test]
    fn metodo_desconhecido_devolve_erro_padrao() {
        let (ctx, bus) = (
            FakeCtx {
                peers: vec![],
                conteudos: vec![],
            },
            AgentBus::new(),
        );
        let req = json!({ "jsonrpc": "2.0", "id": 9, "method": "foo/bar" });
        let resp = handle_request(NodeId::new_v4(), &req, &ctx, &bus).unwrap();
        assert_eq!(resp["error"]["code"], -32601);
    }
}
