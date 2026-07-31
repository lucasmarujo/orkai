mod attention;
mod commands;
mod error;
mod git;
mod indexer;
mod mcp_server;
mod relay;
mod state;

use std::path::PathBuf;
use std::sync::Arc;

use orkai_mcp::AgentBus;
use orkai_storage::WorkspaceRepository;
use tauri::Manager;

use crate::state::AppState;

/// Ponto de entrada compartilhado entre o binario e futuros alvos (testes E2E).
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_env("ORKAI_LOG")
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let state = tauri::async_runtime::block_on(init_state(app.handle().clone(), data_dir))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workspace_load,
            commands::node_create,
            commands::nodes_update,
            commands::node_delete,
            commands::connection_create,
            commands::connection_delete,
            commands::history_undo,
            commands::history_redo,
            commands::workflow_list,
            commands::workflow_active,
            commands::workflow_create,
            commands::workflow_activate,
            commands::node_set_color,
            commands::roles_load,
            commands::roles_save,
            commands::prompts_load,
            commands::prompts_save,
            commands::search_reindex,
            commands::search_query,
            commands::agent_inboxes,
            commands::agent_attention,
            commands::mcp_activity,
            commands::git_workflow_is_repo,
            commands::git_worktree_create,
            commands::git_agents_status,
            commands::git_worktree_merge,
            commands::git_worktree_discard,
            commands::git_node_status,
            commands::git_node_diff,
            commands::dir_list,
            commands::connect_maestro,
            commands::viewport_save,
            commands::file_read,
            commands::file_write,
            commands::pty_spawn,
            commands::pty_write,
            commands::pty_resize,
            commands::pty_scrollback,
            commands::pty_kill,
            commands::pty_default_shell,
            commands::command_available,
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o Orkai");
}

async fn init_state(app: tauri::AppHandle, data_dir: PathBuf) -> anyhow::Result<AppState> {
    let workspace_dir = data_dir.join("workspace");
    std::fs::create_dir_all(&workspace_dir)?;

    let repo = WorkspaceRepository::open(data_dir.join("workspace.db")).await?;

    // Garante ao menos um workflow (migra instalacao antiga) e escolhe o ativo: o que
    // estava aberto no ultimo boot, ou o primeiro da lista.
    repo.load_or_create("Meu primeiro workflow").await?;
    let workflows = repo.list_workflows().await?;
    let salvo = repo.get_setting(state::ACTIVE_WORKFLOW_KEY).await?;
    let ativo = salvo
        .and_then(|s| s.parse::<orkai_core::WorkspaceId>().ok())
        .and_then(|id| workflows.iter().find(|w| w.id == id))
        .or_else(|| workflows.first())
        .cloned()
        .expect("load_or_create garante ao menos um workflow");
    tracing::info!(id = %ativo.id, nome = %ativo.name, "workflow ativo");

    let active = state::ActiveWorkflow {
        id: ativo.id,
        root: PathBuf::from(ativo.root_path),
    };

    let ptys = Arc::new(orkai_pty::PtyRegistry::default());
    let bus = Arc::new(AgentBus::new());
    let attention = Arc::new(attention::Attention::default());
    let mcp_log = mcp_server::McpLog::default();

    // Servidor MCP: cada agente conecta na sua URL e ganha as tools de colaboracao.
    let mcp_port = mcp_server::start(
        app,
        repo.clone(),
        Arc::clone(&ptys),
        Arc::clone(&bus),
        mcp_log.clone(),
        workspace_dir.clone(),
    )?;
    tracing::info!(porta = mcp_port, "servidor MCP no ar");

    // Entrega automatica: e o que faz o fluxo continuar sem o humano cutucar cada agente.
    relay::start(Arc::clone(&bus), Arc::clone(&attention), Arc::clone(&ptys));

    Ok(AppState {
        repo,
        active: std::sync::Mutex::new(active),
        default_dir: workspace_dir,
        ptys,
        pty_backend: Default::default(),
        history: Default::default(),
        bus,
        mcp_port,
        mcp_log,
        attention,
    })
}
