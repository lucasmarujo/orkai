use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use orkai_core::{NodeId, NodeKind};
use orkai_mcp::{handle_request, AgentBus, McpContext, Peer, PeerContent, PeerError};
use orkai_pty::PtyRegistry;
use orkai_storage::WorkspaceRepository;
use serde::Serialize;
use serde_json::{json, Value};
use tiny_http::{Header, Method, Response, Server};

/// Trecho final do scrollback exposto pelo `read_peer_output`, em bytes.
const PEER_OUTPUT_TAIL: usize = 4096;

/// Teto do texto de uma nota entregue ao agente. Notas sao documentos: vale o comeco,
/// nao a cauda — por isso corta no fim, ao contrario do scrollback.
const NOTE_MAX: usize = 16 * 1024;

/// Uma chamada de ferramenta MCP registrada, para o debugger visual de agente.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCall {
    pub node_id: String,
    pub tool: String,
    pub ok: bool,
    pub at: i64,
}

/// Log circular das chamadas MCP recentes. Compartilhado com os comandos Tauri, que o
/// expoem ao front. E a base do "veja cada tool call" do documento de visao.
pub type McpLog = Arc<Mutex<VecDeque<McpCall>>>;

const LOG_CAP: usize = 200;

fn registrar(log: &McpLog, node_id: NodeId, rpc: &Value, resposta: &Option<Value>) {
    // So chamadas de ferramenta interessam ao debugger; initialize/list sao ruido.
    if rpc.get("method").and_then(Value::as_str) != Some("tools/call") {
        return;
    }
    let tool = rpc
        .get("params")
        .and_then(|p| p.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("?")
        .to_string();
    // Sem `error` na resposta = sucesso.
    let ok = resposta
        .as_ref()
        .map(|r| r.get("error").is_none())
        .unwrap_or(true);

    let mut log = log.lock().expect("log envenenado");
    log.push_back(McpCall {
        node_id: node_id.to_string(),
        tool,
        ok,
        at: agora_ms(),
    });
    if log.len() > LOG_CAP {
        log.pop_front();
    }
}

fn agora_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Implementacao real do [`McpContext`], sobre o workspace persistido e o registry de PTY.
///
/// Cada metodo recarrega o workspace: arestas mudam a qualquer momento (o usuario liga e
/// desliga nos no canvas), entao a ACL tem de refletir o estado atual, nao um snapshot do
/// spawn. A carga e sincrona via `block_on` — roda na thread do servidor HTTP, fora do
/// runtime, e chamadas de tool sao raras (nao e caminho de frame).
struct AppMcpContext {
    repo: WorkspaceRepository,
    ptys: Arc<PtyRegistry>,
    /// Fallback quando o workflow nao tem pasta propria (ver `workflow_root`).
    default_dir: PathBuf,
}

impl AppMcpContext {
    /// Workflow que contem o `caller` — nao o ativo. Um agente rodando no workflow A
    /// continua conversando com seus peers de A mesmo que o usuario abra o workflow B.
    fn workspace_of(&self, caller: NodeId) -> Option<orkai_core::Workspace> {
        // block_on numa thread nao-async (tiny_http): usa o runtime global do Tauri.
        tauri::async_runtime::block_on(async {
            let id = self.repo.containing_workflow_id(caller).await.ok()??;
            self.repo.load_workflow(id).await.ok()
        })
    }

    /// Pasta do workflow indicado. Notas sao relativas a raiz do workflow que as contem,
    /// que pode nao ser o ativo — por isso nao da para usar `AppState::active_root`.
    fn workflow_root(&self, workflow_id: uuid::Uuid) -> PathBuf {
        let root = tauri::async_runtime::block_on(self.repo.list_workflows())
            .ok()
            .and_then(|ws| ws.into_iter().find(|w| w.id == workflow_id))
            .map(|w| PathBuf::from(w.root_path))
            .unwrap_or_default();

        if root.as_os_str().is_empty() || !root.exists() {
            self.default_dir.clone()
        } else {
            root
        }
    }
}

/// Nome legivel de um no, para o agente mirar por nome em vez de UUID.
fn display_name(kind: &NodeKind) -> String {
    match kind {
        NodeKind::Agent { name, .. } => name.clone(),
        NodeKind::Terminal { .. } => "Terminal".into(),
        NodeKind::Markdown { .. } => "Nota".into(),
        NodeKind::Frame { title } => title.clone(),
    }
}

impl McpContext for AppMcpContext {
    fn peers(&self, caller: NodeId) -> Vec<Peer> {
        let Some(ws) = self.workspace_of(caller) else {
            return Vec::new();
        };
        ws.peers_of(caller)
            .into_iter()
            .filter_map(|id| {
                ws.node(id).ok().map(|n| Peer {
                    id,
                    name: display_name(&n.kind),
                })
            })
            .collect()
    }

    fn is_connected(&self, caller: NodeId, target: NodeId) -> bool {
        self.workspace_of(caller)
            .map(|ws| ws.are_connected(caller, target))
            .unwrap_or(false)
    }

    fn peer_content(&self, caller: NodeId, target: NodeId) -> Result<PeerContent, PeerError> {
        let Some(ws) = self.workspace_of(caller) else {
            return Err(PeerError::NotConnected);
        };
        if !ws.are_connected(caller, target) {
            return Err(PeerError::NotConnected);
        }
        let Ok(node) = ws.node(target) else {
            return Err(PeerError::NotConnected);
        };

        match &node.kind {
            // Nota: le o arquivo do disco. E o caso que faz uma nota ligada a um agente
            // virar contexto de verdade (plano, spec) em vez de so uma linha no canvas.
            NodeKind::Markdown { file_path, .. } => {
                let raiz = self.workflow_root(ws.id);
                let caminho = crate::state::resolve_in(&raiz, file_path).map_err(|_| {
                    PeerError::NotReadable {
                        kind: "markdown".into(),
                    }
                })?;
                let texto =
                    std::fs::read_to_string(&caminho).map_err(|_| PeerError::NotReadable {
                        kind: "markdown".into(),
                    })?;

                // Editores do Windows gravam BOM; sem remover, ele entra como lixo na
                // primeira linha do contexto do agente.
                let mut texto = texto.strip_prefix('\u{feff}').unwrap_or(&texto).to_string();
                if texto.len() > NOTE_MAX {
                    // Corta em fronteira de char para nao quebrar UTF-8.
                    let corte = (0..=NOTE_MAX)
                        .rev()
                        .find(|i| texto.is_char_boundary(*i))
                        .unwrap_or(0);
                    texto.truncate(corte);
                    texto.push_str("\n[...nota truncada]");
                }
                Ok(PeerContent::Note {
                    path: file_path.display().to_string(),
                    text: texto,
                })
            }

            // Terminal e agente: a saida vem do PTY, se a sessao estiver viva.
            NodeKind::Terminal { .. } | NodeKind::Agent { .. } => {
                let bytes = self
                    .ptys
                    .with(target, |sessao| Ok(sessao.scrollback()))
                    .map_err(|_| PeerError::NotReadable {
                        kind: format!("{} sem sessao ativa", node.kind.tag()),
                    })?;
                // Scrollback sao bytes crus com ANSI; a cauda basta e evita despejar KBs.
                let inicio = bytes.len().saturating_sub(PEER_OUTPUT_TAIL);
                Ok(PeerContent::Terminal(
                    String::from_utf8_lossy(&bytes[inicio..]).into_owned(),
                ))
            }

            outro => Err(PeerError::NotReadable {
                kind: outro.tag().to_string(),
            }),
        }
    }
}

/// URL que um agente usa para falar com o servidor MCP. A identidade dele vai no path:
/// o servidor deriva o `caller` disso, e e nisso que a ACL se apoia.
pub fn agent_url(port: u16, node_id: NodeId) -> String {
    format!("http://127.0.0.1:{port}/mcp/{node_id}")
}

/// Sobe o servidor MCP numa thread propria e devolve a porta escolhida.
///
/// Porta efemera (`:0`): evita conflito quando ha outra instancia aberta — o mesmo
/// problema que ja nos mordeu com o Vite.
pub fn start(
    repo: WorkspaceRepository,
    ptys: Arc<PtyRegistry>,
    bus: Arc<AgentBus>,
    log: McpLog,
    default_dir: PathBuf,
) -> std::io::Result<u16> {
    let server = Server::http("127.0.0.1:0").map_err(|e| std::io::Error::other(e.to_string()))?;
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);

    std::thread::spawn(move || {
        for mut request in server.incoming_requests() {
            let resposta = tratar(&mut request, &repo, &ptys, &bus, &log, &default_dir);
            let header = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                .expect("header valido");
            let _ = request.respond(Response::from_string(resposta).with_header(header));
        }
    });

    Ok(port)
}

fn tratar(
    request: &mut tiny_http::Request,
    repo: &WorkspaceRepository,
    ptys: &Arc<PtyRegistry>,
    bus: &AgentBus,
    log: &McpLog,
    default_dir: &std::path::Path,
) -> String {
    // So POST em /mcp/<uuid>.
    if *request.method() != Method::Post {
        return erro_json("apenas POST");
    }
    let Some(caller) = node_id_do_path(request.url()) else {
        return erro_json("url invalida: esperado /mcp/<node-id>");
    };

    let mut corpo = String::new();
    if request.as_reader().read_to_string(&mut corpo).is_err() {
        return erro_json("corpo ilegivel");
    }
    let Ok(rpc) = serde_json::from_str::<Value>(&corpo) else {
        return erro_json("json invalido");
    };

    let ctx = AppMcpContext {
        repo: repo.clone(),
        ptys: Arc::clone(ptys),
        default_dir: default_dir.to_path_buf(),
    };

    // Notificacao (sem id) -> corpo vazio, status implicito 200.
    let resultado = handle_request(caller, &rpc, &ctx, bus);
    registrar(log, caller, &rpc, &resultado);
    match resultado {
        Some(resposta) => resposta.to_string(),
        None => String::new(),
    }
}

/// Extrai o UUID de `/mcp/<uuid>`, ignorando query string.
fn node_id_do_path(url: &str) -> Option<NodeId> {
    let caminho = url.split('?').next().unwrap_or(url);
    caminho.strip_prefix("/mcp/")?.parse().ok()
}

fn erro_json(msg: &str) -> String {
    json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32600, "message": msg } }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extrai_node_id_do_path() {
        let id = NodeId::new_v4();
        assert_eq!(node_id_do_path(&format!("/mcp/{id}")), Some(id));
        assert_eq!(node_id_do_path(&format!("/mcp/{id}?x=1")), Some(id));
        assert_eq!(node_id_do_path("/mcp/nao-e-uuid"), None);
        assert_eq!(node_id_do_path("/outra"), None);
    }

    #[test]
    fn agent_url_usa_a_porta_e_o_id() {
        let id = NodeId::new_v4();
        assert_eq!(
            agent_url(7331, id),
            format!("http://127.0.0.1:7331/mcp/{id}")
        );
    }
}
