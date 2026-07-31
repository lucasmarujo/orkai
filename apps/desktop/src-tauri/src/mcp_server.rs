use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use orkai_core::{Command, Node, NodeId, NodeKind, Size, Vec2};
use orkai_mcp::{
    handle_request, AgentBus, McpContext, Peer, PeerContent, PeerError, PeerState, PeerStatus,
};
use orkai_pty::PtyRegistry;
use orkai_storage::WorkspaceRepository;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tiny_http::{Header, Method, Response, Server};

use crate::attention::AgentStatus;
use crate::state::AppState;

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
    /// Para avisar o front quando um agente escreve numa nota (`orkai_note`).
    app: AppHandle,
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

/// Tamanho do agente criado por outro agente. Espelha `DEFAULT_NODE_SIZE.agent` do
/// front — e o mesmo no, so que nascido de uma tool em vez do dialogo.
const AGENT_SIZE: (f32, f32) = (680.0, 460.0);

/// Folga entre o criador e o agente criado, para as bordas nao se encostarem.
const FOLGA: f32 = 40.0;

/// Terminal inicial do agente criado por tool. O front reajusta no primeiro `fit`, mas
/// o processo precisa de um tamanho valido para subir antes de qualquer no ser montado.
const PTY_INICIAL: (u16, u16) = (120, 30);

/// Teto de agentes ligados a um mesmo supervisor.
///
/// Cada agente e um processo de verdade. Um supervisor que entra em laco criando
/// ajudantes derrubaria a maquina em segundos; com o teto ele recebe um erro que da para
/// ler e decidir. Oito e mais do que qualquer orquestracao util precisa de uma vez.
const MAX_FILHOS: usize = 8;

/// Quantos agentes ja estao ligados a este no.
fn agentes_ligados(ws: &orkai_core::Workspace, caller: NodeId) -> usize {
    ws.peers_of(caller)
        .into_iter()
        .filter(|id| {
            ws.node(*id)
                .is_ok_and(|n| matches!(n.kind, NodeKind::Agent { .. }))
        })
        .count()
}

/// Onde o agente novo nasce: a direita do criador, empilhado por quem ja esta ligado a
/// ele. Nao e layout perfeito — e o suficiente para nascer visivel e sem sobrepor o pai.
fn posicao_do_filho(criador: &Node, ja_ligados: usize) -> Result<Vec2, PeerError> {
    Vec2::new(
        criador.position.x + criador.size.width + FOLGA,
        criador.position.y + ja_ligados as f32 * (AGENT_SIZE.1 + FOLGA),
    )
    .map_err(|erro| PeerError::Failed {
        reason: erro.to_string(),
    })
}

/// Traduz o estado que a camada de atencao deduz para o vocabulario do MCP.
fn estado_do_agente(status: AgentStatus) -> PeerState {
    match status {
        AgentStatus::Running => PeerState::Running,
        AgentStatus::Waiting => PeerState::Waiting,
        AgentStatus::Idle => PeerState::Idle,
        AgentStatus::Exited => PeerState::Exited,
    }
}

/// Nome legivel de um no, para o agente mirar por nome em vez de UUID.
fn display_name(kind: &NodeKind) -> String {
    match kind {
        NodeKind::Agent { name, .. } => name.clone(),
        NodeKind::Terminal { .. } => "Terminal".into(),
        NodeKind::Markdown { .. } => "Nota".into(),
        NodeKind::Frame { title } => title.clone(),
        NodeKind::Git {} => "Git".into(),
        NodeKind::FileTree { .. } => "Arquivos".into(),
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

    fn peer_statuses(&self, caller: NodeId) -> Vec<PeerStatus> {
        let Some(ws) = self.workspace_of(caller) else {
            return Vec::new();
        };
        let agora = crate::attention::agora_ms();
        let estado = self.app.try_state::<AppState>();

        ws.peers_of(caller)
            .into_iter()
            .filter_map(|id| {
                let node = ws.node(id).ok()?;
                let state = estado
                    .as_ref()
                    .and_then(|app| app.attention.state_of(id, agora))
                    .map_or(PeerState::Unknown, estado_do_agente);
                Some(PeerStatus {
                    peer: Peer {
                        id,
                        name: display_name(&node.kind),
                    },
                    kind: node.kind.tag().to_string(),
                    state,
                })
            })
            .collect()
    }

    fn spawn_agent(
        &self,
        caller: NodeId,
        name: &str,
        role: &str,
        system_prompt: &str,
    ) -> Result<Peer, PeerError> {
        let Some(app) = self.app.try_state::<AppState>() else {
            return Err(PeerError::Failed {
                reason: "aplicacao ainda iniciando".into(),
            });
        };
        let Some(mut ws) = self.workspace_of(caller) else {
            return Err(PeerError::NotConnected);
        };
        let irmaos = agentes_ligados(&ws, caller);
        if irmaos >= MAX_FILHOS {
            return Err(PeerError::Failed {
                reason: format!(
                    "voce ja tem {MAX_FILHOS} agentes ligados: encerre um com orkai_stop_agent antes de criar outro"
                ),
            });
        }

        // So um agente cria agente: e do criador que o filho herda o CLI, e so um CLI
        // cabeado no MCP consegue conversar de volta.
        let (command, args, cwd, position) = {
            let criador = ws.node(caller).map_err(|_| PeerError::NotConnected)?;
            let NodeKind::Agent {
                command, args, cwd, ..
            } = &criador.kind
            else {
                return Err(PeerError::NotReadable {
                    kind: criador.kind.tag().to_string(),
                });
            };
            let position = posicao_do_filho(criador, irmaos)?;
            (command.clone(), args.clone(), cwd.clone(), position)
        };

        let node = Node {
            id: NodeId::new_v4(),
            kind: NodeKind::Agent {
                name: name.to_string(),
                role: role.to_string(),
                args: crate::commands::args_do_filho(&command, &args, system_prompt),
                command,
                cwd,
                system_prompt: system_prompt.to_string(),
            },
            position,
            size: Size::new(AGENT_SIZE.0, AGENT_SIZE.1).map_err(|erro| PeerError::Failed {
                reason: erro.to_string(),
            })?,
            z_index: ws.next_z_index(),
            created_at: agora_ms(),
        };

        let falhou = |erro: String| PeerError::Failed { reason: erro };
        tauri::async_runtime::block_on(app.repo.save_node(ws.id, &node))
            .map_err(|e| falhou(e.to_string()))?;

        // A aresta com o criador nasce junto: e ela que autoriza os dois a conversarem.
        ws.upsert_node(node.clone());
        let connection = ws
            .add_connection(caller, node.id)
            .ok_or_else(|| falhou("o canvas recusou a aresta com o criador".into()))?;
        let ligar = Command::CreateConnection { connection };
        tauri::async_runtime::block_on(app.repo.apply(ws.id, &ligar))
            .map_err(|e| falhou(e.to_string()))?;
        // Um passo unico de undo desfaz o agente inteiro: aresta e no.
        app.push_history(vec![Command::CreateNode { node: node.clone() }, ligar]);

        let subiu = tauri::async_runtime::block_on(crate::commands::spawn_pty(
            &self.app,
            &app,
            &ws,
            node.id,
            PTY_INICIAL.0,
            PTY_INICIAL.1,
        ));

        // O canvas nao viu esta criacao passar por ele. Sem o aviso, o no so apareceria
        // no proximo reload — inclusive quando o processo falhou e o usuario precisa ver.
        if let Err(erro) = self.app.emit("workspace://changed", ()) {
            tracing::warn!(%erro, "falha ao avisar o front sobre o agente criado");
        }
        subiu.map_err(|e| falhou(e.to_string()))?;

        Ok(Peer {
            id: node.id,
            name: name.to_string(),
        })
    }

    fn stop_agent(&self, caller: NodeId, target: NodeId) -> Result<(), PeerError> {
        let Some(app) = self.app.try_state::<AppState>() else {
            return Err(PeerError::Failed {
                reason: "aplicacao ainda iniciando".into(),
            });
        };
        let Some(ws) = self.workspace_of(caller) else {
            return Err(PeerError::NotConnected);
        };
        if !ws.are_connected(caller, target) {
            return Err(PeerError::NotConnected);
        }
        let Ok(node) = ws.node(target) else {
            return Err(PeerError::NotConnected);
        };
        if !matches!(node.kind, NodeKind::Agent { .. }) {
            return Err(PeerError::NotReadable {
                kind: node.kind.tag().to_string(),
            });
        }

        // Mesmo encerramento do `pty_kill`: mata o processo e tira o no da camada de
        // atencao. O no e o transcript continuam no canvas.
        let _ = app.ptys.remove(target);
        app.attention.forget(target);
        app.bus.forget(target);
        Ok(())
    }

    fn write_note(
        &self,
        caller: NodeId,
        target: NodeId,
        text: &str,
        append: bool,
    ) -> Result<String, PeerError> {
        let Some(ws) = self.workspace_of(caller) else {
            return Err(PeerError::NotConnected);
        };
        if !ws.are_connected(caller, target) {
            return Err(PeerError::NotConnected);
        }
        let Ok(node) = ws.node(target) else {
            return Err(PeerError::NotConnected);
        };
        // Escrita so em nota: terminal e frame nao tem arquivo para receber texto.
        let NodeKind::Markdown { file_path, .. } = &node.kind else {
            return Err(PeerError::NotReadable {
                kind: node.kind.tag().to_string(),
            });
        };

        let raiz = self.workflow_root(ws.id);
        let caminho =
            crate::state::resolve_in(&raiz, file_path).map_err(|e| PeerError::WriteFailed {
                reason: e.to_string(),
            })?;

        let escrita = if append {
            escrever_no_fim(&caminho, text)
        } else {
            std::fs::write(&caminho, text)
        };
        escrita.map_err(|e| PeerError::WriteFailed {
            reason: e.to_string(),
        })?;

        // A nota aberta no canvas recarrega sozinha; sem isto o texto so apareceria na
        // proxima montagem do no e a escrita pareceria ter falhado.
        let caminho_rel = file_path.display().to_string();
        if let Err(erro) = self.app.emit("note://changed", &caminho_rel) {
            tracing::warn!(%erro, "falha ao avisar o front sobre a nota");
        }
        Ok(caminho_rel)
    }
}

/// Acrescenta ao fim da nota, separando do que ja existe por uma linha em branco.
fn escrever_no_fim(caminho: &std::path::Path, texto: &str) -> std::io::Result<()> {
    use std::io::Write;

    let vazio = std::fs::metadata(caminho)
        .map(|m| m.len() == 0)
        .unwrap_or(true);
    let mut arquivo = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(caminho)?;
    if vazio {
        writeln!(arquivo, "{texto}")
    } else {
        writeln!(arquivo, "\n{texto}")
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
    app: AppHandle,
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
            let resposta = tratar(&mut request, &app, &repo, &ptys, &bus, &log, &default_dir);
            let header = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                .expect("header valido");
            let _ = request.respond(Response::from_string(resposta).with_header(header));
        }
    });

    Ok(port)
}

fn tratar(
    request: &mut tiny_http::Request,
    app: &AppHandle,
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
        app: app.clone(),
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

    fn no(kind: NodeKind) -> Node {
        Node {
            id: NodeId::new_v4(),
            kind,
            position: Vec2::ZERO,
            size: Size::new(100.0, 100.0).unwrap(),
            z_index: 0,
            created_at: 0,
        }
    }

    fn agente() -> Node {
        no(NodeKind::Agent {
            name: "Worker".into(),
            role: "QA".into(),
            command: "claude".into(),
            args: vec![],
            cwd: std::path::PathBuf::from("C:/proj"),
            system_prompt: String::new(),
        })
    }

    #[test]
    fn agentes_ligados_conta_so_agentes_vizinhos() {
        let mut ws = orkai_core::Workspace::new("t");
        let supervisor = agente();
        let filho = agente();
        let nota = no(NodeKind::Markdown {
            file_path: std::path::PathBuf::from("plano.md"),
            color: String::new(),
        });
        let solto = agente();
        let (id_sup, id_filho, id_solto) = (supervisor.id, filho.id, solto.id);
        for node in [supervisor, filho, nota.clone(), solto] {
            ws.upsert_node(node);
        }
        ws.add_connection(id_sup, id_filho);
        // Nota vizinha nao conta: o teto e de processo, nao de aresta.
        ws.add_connection(id_sup, nota.id);

        assert_eq!(agentes_ligados(&ws, id_sup), 1);
        // Agente sem aresta com o supervisor nao entra na conta dele.
        assert_eq!(agentes_ligados(&ws, id_solto), 0);
    }

    #[test]
    fn o_filho_nasce_ao_lado_do_criador_sem_sobrepor_os_irmaos() {
        let mut criador = agente();
        criador.position = Vec2::new(100.0, 50.0).unwrap();
        criador.size = Size::new(680.0, 460.0).unwrap();

        let primeiro = posicao_do_filho(&criador, 0).unwrap();
        assert_eq!((primeiro.x, primeiro.y), (100.0 + 680.0 + FOLGA, 50.0));

        let segundo = posicao_do_filho(&criador, 1).unwrap();
        assert_eq!(segundo.x, primeiro.x, "mesma coluna");
        assert!(segundo.y >= primeiro.y + AGENT_SIZE.1, "abaixo do irmao");
    }

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

    #[test]
    fn append_separa_do_que_ja_estava_na_nota() {
        let caminho = std::env::temp_dir().join(format!("orkai-nota-{}.md", NodeId::new_v4()));

        // Nota nova: sem linha em branco sobrando no comeco do arquivo.
        escrever_no_fim(&caminho, "# Plano").unwrap();
        assert_eq!(std::fs::read_to_string(&caminho).unwrap(), "# Plano\n");

        // Segundo agente escrevendo: um bloco markdown novo, nao uma linha grudada.
        escrever_no_fim(&caminho, "## Decisao").unwrap();
        assert_eq!(
            std::fs::read_to_string(&caminho).unwrap(),
            "# Plano\n\n## Decisao\n"
        );

        std::fs::remove_file(&caminho).ok();
    }
}
