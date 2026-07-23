use std::path::PathBuf;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use orkai_core::{
    Command, Connection, ConnectionId, Node, NodeId, NodeKind, Size, Vec2, Viewport, Workspace,
};
use orkai_pty::{default_shell, PtyBackend, PtyEvent, PtySpec};
use orkai_storage::WorkflowSummary;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::state::AppState;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyDataEvent {
    node_id: String,
    /// Bytes crus em base64: um bloco do PTY pode cortar um caractere UTF-8 ao meio,
    /// e converter para String aqui corromperia acentos e emoji na fronteira.
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyExitEvent {
    node_id: String,
    code: i32,
}

// ---------------------------------------------------------------- workspace

#[tauri::command]
pub async fn workspace_load(state: State<'_, AppState>) -> Result<Workspace> {
    state.load_active().await
}

#[tauri::command]
pub async fn node_create(
    state: State<'_, AppState>,
    kind: NodeKind,
    position: Vec2,
    size: Size,
) -> Result<Node> {
    let workspace = state.load_active().await?;

    let node = Node {
        id: Uuid::new_v4(),
        kind,
        position: Vec2::new(position.x, position.y)?,
        size: Size::new(size.width, size.height)?,
        z_index: workspace.next_z_index(),
        created_at: agora_ms(),
    };

    // Um no markdown precisa do arquivo existindo para o editor abrir vazio em vez de falhar.
    if let NodeKind::Markdown { file_path, .. } = &node.kind {
        let caminho = state.resolve_path(file_path)?;
        if !caminho.exists() {
            if let Some(pai) = caminho.parent() {
                std::fs::create_dir_all(pai)?;
            }
            std::fs::write(&caminho, "")?;
        }
    }

    state.repo.save_node(state.active_id(), &node).await?;
    state.push_history(vec![Command::CreateNode { node: node.clone() }]);
    Ok(node)
}

/// Persiste mover/redimensionar em lote e registra um unico passo de undo.
///
/// O front chama no fim do gesto, nao a cada frame: um arrasto e um passo de undo,
/// e nao trezentos.
#[tauri::command]
pub async fn nodes_update(
    state: State<'_, AppState>,
    before: Vec<Node>,
    after: Vec<Node>,
) -> Result<()> {
    for node in &after {
        Vec2::new(node.position.x, node.position.y)?;
        Size::new(node.size.width, node.size.height)?;
    }

    let comando = Command::UpdateNodes { before, after };
    state.repo.apply(state.active_id(), &comando).await?;
    state.push_history(vec![comando]);
    Ok(())
}

#[tauri::command]
pub async fn node_delete(state: State<'_, AppState>, id: NodeId) -> Result<()> {
    let workspace = state.load_active().await?;
    let node = workspace.node(id)?.clone();

    // Ignora sessao inexistente: nem todo no e terminal.
    let _ = state.ptys.remove(id);
    // Descarta mensagens pendentes para o no que se foi.
    state.bus.forget(id);

    // As arestas viram comandos proprios no mesmo grupo: o undo as recria na ordem
    // certa, depois do no voltar a existir.
    let mut grupo: Vec<Command> = workspace
        .connections_of(id)
        .into_iter()
        .map(|connection| Command::DeleteConnection { connection })
        .collect();
    grupo.push(Command::DeleteNode { node });

    // O CASCADE do banco ja derruba as arestas; aplicar so o delete do no basta.
    state.repo.delete_node(id).await?;
    state.push_history(grupo);
    Ok(())
}

// ---------------------------------------------------------------- conexoes

#[tauri::command]
pub async fn connection_create(
    state: State<'_, AppState>,
    from: NodeId,
    to: NodeId,
) -> Result<Option<Connection>> {
    let mut workspace = state.load_active().await?;
    // Laco, duplicata e no inexistente sao recusados no dominio, nao aqui.
    let Some(connection) = workspace.add_connection(from, to) else {
        return Ok(None);
    };

    let comando = Command::CreateConnection {
        connection: connection.clone(),
    };
    state.repo.apply(state.active_id(), &comando).await?;
    state.push_history(vec![comando]);
    Ok(Some(connection))
}

#[tauri::command]
pub async fn connection_delete(state: State<'_, AppState>, id: ConnectionId) -> Result<()> {
    let mut workspace = state.load_active().await?;
    let connection = workspace.remove_connection(id)?;

    let comando = Command::DeleteConnection { connection };
    state.repo.apply(state.active_id(), &comando).await?;
    state.push_history(vec![comando]);
    Ok(())
}

// ---------------------------------------------------------------- historico

/// Desfaz o ultimo passo e devolve o workspace ja recarregado.
///
/// Devolver o estado inteiro em vez de um diff evita a classe de bug em que o front
/// aplica o inverso de um jeito e o banco de outro.
#[tauri::command]
pub async fn history_undo(state: State<'_, AppState>) -> Result<Workspace> {
    let comandos = state.history.lock().expect("historico envenenado").undo();
    state.aplicar_todos(comandos.unwrap_or_default()).await
}

#[tauri::command]
pub async fn history_redo(state: State<'_, AppState>) -> Result<Workspace> {
    let comandos = state.history.lock().expect("historico envenenado").redo();
    state.aplicar_todos(comandos.unwrap_or_default()).await
}

#[tauri::command]
pub async fn viewport_save(state: State<'_, AppState>, viewport: Viewport) -> Result<()> {
    state
        .repo
        .save_viewport(state.active_id(), &viewport)
        .await?;
    Ok(())
}

// ---------------------------------------------------------------- arquivos

#[tauri::command]
pub async fn file_read(state: State<'_, AppState>, path: PathBuf) -> Result<String> {
    let caminho = state.resolve_path(&path)?;
    Ok(std::fs::read_to_string(caminho).unwrap_or_default())
}

#[tauri::command]
pub async fn file_write(state: State<'_, AppState>, path: PathBuf, content: String) -> Result<()> {
    let caminho = state.resolve_path(&path)?;
    if let Some(pai) = caminho.parent() {
        std::fs::create_dir_all(pai)?;
    }
    std::fs::write(caminho, content)?;
    Ok(())
}

// ---------------------------------------------------------------- workflows

#[tauri::command]
pub async fn workflow_list(state: State<'_, AppState>) -> Result<Vec<WorkflowSummary>> {
    Ok(state.repo.list_workflows().await?)
}

/// Id do workflow ativo, para o front destacar na sidebar.
#[tauri::command]
pub fn workflow_active(state: State<'_, AppState>) -> String {
    state.active_id().to_string()
}

/// Cria um workflow ligado a uma pasta de projeto e ja o ativa.
#[tauri::command]
pub async fn workflow_create(
    state: State<'_, AppState>,
    name: String,
    root_path: String,
) -> Result<Workspace> {
    let nome = if name.trim().is_empty() {
        "Novo workflow"
    } else {
        name.trim()
    };
    let resumo = state.repo.create_workflow(nome, root_path.trim()).await?;
    state
        .set_active(resumo.id, PathBuf::from(&resumo.root_path))
        .await?;
    state.load_active().await
}

/// Troca o workflow ativo e devolve o novo, para o canvas recarregar.
#[tauri::command]
pub async fn workflow_activate(state: State<'_, AppState>, id: NodeId) -> Result<Workspace> {
    let resumo = state
        .repo
        .list_workflows()
        .await?
        .into_iter()
        .find(|w| w.id == id)
        .ok_or_else(|| AppError::Internal(format!("workflow inexistente: {id}")))?;
    state
        .set_active(resumo.id, PathBuf::from(&resumo.root_path))
        .await?;
    state.load_active().await
}

/// Muda a cor de uma nota. Devolve o no atualizado.
#[tauri::command]
pub async fn node_set_color(state: State<'_, AppState>, id: NodeId, color: String) -> Result<Node> {
    let workspace = state.load_active().await?;
    let mut node = workspace.node(id)?.clone();
    let NodeKind::Markdown { file_path, .. } = &node.kind else {
        return Err(AppError::Internal("cor so se aplica a notas".into()));
    };

    let antes = node.clone();
    node.kind = NodeKind::Markdown {
        file_path: file_path.clone(),
        color,
    };

    let comando = Command::UpdateNodes {
        before: vec![antes],
        after: vec![node.clone()],
    };
    state.repo.apply(state.active_id(), &comando).await?;
    state.push_history(vec![comando]);
    Ok(node)
}

// ---------------------------------------------------------------- roles

/// Chave em `app_setting` das roles customizadas (JSON opaco para o backend).
const CUSTOM_ROLES_KEY: &str = "custom_roles";

/// Roles criadas pelo usuario, como JSON. O backend so guarda o blob; o formato
/// (label + prompt) e concern do front.
#[tauri::command]
pub async fn roles_load(state: State<'_, AppState>) -> Result<String> {
    Ok(state
        .repo
        .get_setting(CUSTOM_ROLES_KEY)
        .await?
        .unwrap_or_else(|| "[]".into()))
}

#[tauri::command]
pub async fn roles_save(state: State<'_, AppState>, json: String) -> Result<()> {
    state.repo.set_setting(CUSTOM_ROLES_KEY, &json).await?;
    Ok(())
}

// ---------------------------------------------------------------- colaboracao (M4)

/// Contagem de mensagens pendentes por no, para o badge de inbox no canvas.
#[derive(Serialize)]
struct InboxCount {
    node_id: String,
    pending: usize,
}

#[tauri::command]
pub async fn agent_inboxes(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>> {
    let workspace = state.load_active().await?;
    Ok(workspace
        .nodes
        .iter()
        .filter(|n| matches!(n.kind, NodeKind::Agent { .. }))
        .map(|n| {
            serde_json::to_value(InboxCount {
                node_id: n.id.to_string(),
                pending: state.bus.pending(n.id),
            })
            .expect("serializa")
        })
        .collect())
}

/// Chamadas MCP recentes — o debugger visual de agente ("veja cada tool call").
#[tauri::command]
pub fn mcp_activity(state: State<'_, AppState>) -> Vec<crate::mcp_server::McpCall> {
    state
        .mcp_log
        .lock()
        .expect("log envenenado")
        .iter()
        .cloned()
        .collect()
}

/// Modo Maestro: liga um orquestrador a varios workers de uma vez.
///
/// Cada aresta criada abre um canal MCP (a ACL do `orkai_send`). Reusa
/// `add_connection`, entao laco e duplicata sao recusados de graca. Devolve as arestas
/// realmente criadas, para o front atualizar sem recarregar tudo.
#[tauri::command]
pub async fn connect_maestro(
    state: State<'_, AppState>,
    orchestrator: NodeId,
    workers: Vec<NodeId>,
) -> Result<Vec<Connection>> {
    let mut workspace = state.load_active().await?;
    let mut criadas = Vec::new();

    for worker in workers {
        if let Some(connection) = workspace.add_connection(orchestrator, worker) {
            let comando = Command::CreateConnection {
                connection: connection.clone(),
            };
            state.repo.apply(state.active_id(), &comando).await?;
            criadas.push((connection, comando));
        }
    }

    // Um passo unico de undo desfaz o Maestro inteiro.
    if !criadas.is_empty() {
        state.push_history(criadas.iter().map(|(_, c)| c.clone()).collect());
    }
    Ok(criadas.into_iter().map(|(conn, _)| conn).collect())
}

// ---------------------------------------------------------------- pty

#[tauri::command]
pub async fn pty_spawn(
    app: AppHandle,
    state: State<'_, AppState>,
    node_id: NodeId,
    cols: u16,
    rows: u16,
) -> Result<()> {
    if state.ptys.contains(node_id) {
        return Ok(());
    }

    let workspace = state.load_active().await?;
    let node = workspace.node(node_id)?;
    let Some((comando, args, cwd)) = node.kind.spawn_spec() else {
        return Err(AppError::NotSpawnable(node_id.to_string()));
    };
    let eh_agente = matches!(node.kind, NodeKind::Agent { .. });

    // cwd vazio ou inexistente -> pasta do workflow ativo (a pasta do projeto).
    let cwd = if cwd.as_os_str().is_empty() || !cwd.exists() {
        state.active_root()
    } else {
        cwd.to_path_buf()
    };
    // Terminal manda comando vazio para pedir o shell padrao; agente sempre traz o seu.
    let comando = if comando.is_empty() {
        default_shell()
    } else {
        comando.to_string()
    };

    // Agente continua a conversa de onde parou: semeia o scrollback com o transcript
    // persistido. Terminal nao persiste, entao isto vem vazio.
    let seed = if eh_agente {
        state.repo.load_output(node_id).await?
    } else {
        Vec::new()
    };

    // Conecta o agente ao servidor MCP do Orkai: e assim que ele ganha as tools de
    // colaboracao (list_peers, send, inbox, read_peer_output). A URL carrega o id do no,
    // que e como o servidor sabe quem chamou e aplica a ACL.
    let mut args = args.to_vec();
    if eh_agente {
        args.extend(mcp_args(&comando, state.mcp_port, node_id));
    }

    let spec = PtySpec::new(comando, cwd)
        .with_args(args)
        .with_size(cols, rows)
        .with_seed(seed);
    let sessao = state.pty_backend.spawn(
        spec,
        std::sync::Arc::new(move |evento| match evento {
            PtyEvent::Data(bytes) => {
                let payload = PtyDataEvent {
                    node_id: node_id.to_string(),
                    data: BASE64.encode(&bytes),
                };
                if let Err(erro) = app.emit(&format!("pty://data/{node_id}"), payload) {
                    tracing::warn!(%erro, "falha ao emitir dados do terminal");
                }
            }
            PtyEvent::Exit { code } => {
                let payload = PtyExitEvent {
                    node_id: node_id.to_string(),
                    code,
                };
                if let Err(erro) = app.emit(&format!("pty://exit/{node_id}"), payload) {
                    tracing::warn!(%erro, "falha ao emitir saida do terminal");
                }
            }
        }),
    )?;

    // Persiste o transcript do agente periodicamente, para sobreviver ao restart.
    // Terminais sao efemeros: nao gastam escrita.
    if eh_agente {
        let scrollback = sessao.scrollback_arc();
        let repo = state.repo.clone();
        tauri::async_runtime::spawn(persistir_output(repo, node_id, scrollback));
    }

    state.ptys.insert(node_id, sessao);
    Ok(())
}

/// Salva o transcript do agente a cada intervalo enquanto a sessao viver.
///
/// A sessao segura uma referencia ao scrollback; quando ela e derrubada (no deletado),
/// `strong_count` cai e a tarefa faz o ultimo save e encerra. So grava quando mudou,
/// para nao reescrever o mesmo blob a cada tick depois que o processo termina.
async fn persistir_output(
    repo: orkai_storage::WorkspaceRepository,
    node_id: NodeId,
    scrollback: std::sync::Arc<std::sync::Mutex<orkai_pty::Scrollback>>,
) {
    use std::time::Duration;

    const INTERVALO: Duration = Duration::from_millis(500);
    let mut ultimo_len = usize::MAX;

    loop {
        tokio::time::sleep(INTERVALO).await;

        // 1 = so a propria tarefa segura o scrollback; a sessao ja morreu.
        let ultima_volta = std::sync::Arc::strong_count(&scrollback) == 1;

        let snapshot = scrollback.lock().expect("scrollback envenenado").snapshot();
        if snapshot.len() != ultimo_len {
            ultimo_len = snapshot.len();
            // Erro aqui e tolerado: se o no acabou de ser deletado, o CASCADE ja levou
            // a linha e a FK recusa o insert. Nao vale derrubar a tarefa por isso.
            if let Err(erro) = repo.save_output(node_id, &snapshot).await {
                tracing::debug!(%erro, "falha ao persistir transcript do agente");
            }
        }

        if ultima_volta {
            break;
        }
    }
}

#[tauri::command]
pub async fn pty_write(state: State<'_, AppState>, node_id: NodeId, data: String) -> Result<()> {
    let bytes = BASE64
        .decode(&data)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    state.ptys.with(node_id, |sessao| sessao.write(&bytes))?;
    Ok(())
}

#[tauri::command]
pub async fn pty_resize(
    state: State<'_, AppState>,
    node_id: NodeId,
    cols: u16,
    rows: u16,
) -> Result<()> {
    state
        .ptys
        .with(node_id, |sessao| sessao.resize(cols, rows))?;
    Ok(())
}

/// Historico da sessao, para remontar o terminal apos a virtualizacao desmontar o no.
#[tauri::command]
pub async fn pty_scrollback(state: State<'_, AppState>, node_id: NodeId) -> Result<String> {
    let bytes = state.ptys.with(node_id, |sessao| Ok(sessao.scrollback()))?;
    Ok(BASE64.encode(bytes))
}

#[tauri::command]
pub async fn pty_kill(state: State<'_, AppState>, node_id: NodeId) -> Result<()> {
    let _ = state.ptys.remove(node_id);
    Ok(())
}

/// Shell padrao sugerido ao criar um terminal.
#[tauri::command]
pub fn pty_default_shell() -> String {
    default_shell()
}

/// Flags que conectam o CLI do agente ao servidor MCP do Orkai.
///
/// So o Claude Code esta cabeado aqui: aceita `--mcp-config` com JSON inline. Codex e
/// Aider registram MCP de outro jeito.
/// ponytail: um provider por vez; adiciona o proximo quando for testar com o binario real.
fn mcp_args(comando: &str, porta: u16, node_id: NodeId) -> Vec<String> {
    let url = crate::mcp_server::agent_url(porta, node_id);
    // Nome do binario sem caminho nem extensao: "C:/.../claude.exe" -> "claude".
    let base = std::path::Path::new(comando)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(comando)
        .to_ascii_lowercase();

    match base.as_str() {
        "claude" => {
            let config = serde_json::json!({
                "mcpServers": { "orkai": { "type": "http", "url": url } }
            });
            vec!["--mcp-config".to_string(), config.to_string()]
        }
        outro => {
            tracing::warn!(provider = outro, "MCP ainda nao cabeado para este agente");
            Vec::new()
        }
    }
}

fn agora_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mcp_args_cabeia_claude_e_ignora_desconhecido() {
        let id = NodeId::new_v4();
        let args = mcp_args("claude", 7331, id);
        assert_eq!(args[0], "--mcp-config");
        assert!(args[1].contains(&id.to_string()), "url carrega o id do no");
        assert!(args[1].contains("\"type\":\"http\""));

        // Caminho completo e .exe tambem resolvem para claude.
        assert_eq!(mcp_args("C:/tools/claude.exe", 1, id).len(), 2);
        // Provider sem wiring: sem args, sem quebrar.
        assert!(mcp_args("codex", 7331, id).is_empty());
    }
}
