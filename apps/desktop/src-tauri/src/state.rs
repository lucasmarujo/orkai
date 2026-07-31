use std::path::{Component, Path, PathBuf};

use std::sync::{Arc, Mutex};

use orkai_core::{Command, UndoStack, Workspace, WorkspaceId};
use orkai_mcp::AgentBus;
use orkai_pty::{ConPtyBackend, PtyRegistry};
use orkai_storage::WorkspaceRepository;

use crate::error::{AppError, Result};

/// Chave em `app_setting` do workflow ativo, para restaurar no proximo boot.
pub const ACTIVE_WORKFLOW_KEY: &str = "active_workflow";

/// Workflow atualmente aberto no canvas.
#[derive(Clone)]
pub struct ActiveWorkflow {
    pub id: WorkspaceId,
    /// Pasta de projeto do workflow. Vazio = usa o diretorio padrao do app.
    pub root: PathBuf,
}

/// Resolve um caminho relativo dentro de `root`.
///
/// Fronteira de confianca: o caminho vem do front, entao caminho absoluto e `..`
/// sao rejeitados antes de qualquer I/O.
pub fn resolve_in(root: &Path, relative: &Path) -> Result<PathBuf> {
    let invalido = relative.components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    });
    if invalido || relative.as_os_str().is_empty() {
        return Err(AppError::PathOutsideWorkspace(
            relative.display().to_string(),
        ));
    }
    Ok(root.join(relative))
}

/// Estado compartilhado entre todos os comandos.
pub struct AppState {
    pub repo: WorkspaceRepository,
    /// Workflow ativo. Trocar de workflow so muda isto; os processos (PTY) seguem vivos.
    pub active: Mutex<ActiveWorkflow>,
    /// Diretorio padrao do app, usado quando o workflow ativo nao tem pasta propria.
    pub default_dir: PathBuf,
    /// `Arc` porque o servidor MCP (thread propria) le o scrollback dos peers por aqui.
    pub ptys: Arc<PtyRegistry>,
    pub pty_backend: ConPtyBackend,
    /// Historico de undo/redo. Vive no backend para que plugins e agentes (M4) tambem
    /// entrem na mesma pilha, em vez de cada origem ter a sua.
    pub history: Mutex<UndoStack>,
    /// Caixas de entrada dos agentes. Compartilhado com a thread do servidor MCP.
    pub bus: Arc<AgentBus>,
    /// Porta em que o servidor MCP escuta, para montar a URL de cada agente.
    pub mcp_port: u16,
    /// Log das chamadas MCP recentes, para o debugger visual de agente.
    pub mcp_log: crate::mcp_server::McpLog,
    /// Estado de atencao dos agentes. `Arc` porque o callback do PTY o alimenta de
    /// dentro da thread da sessao, fora do escopo do `State<'_>`.
    pub attention: Arc<crate::attention::Attention>,
}

impl AppState {
    /// Id do workflow ativo.
    pub fn active_id(&self) -> WorkspaceId {
        self.active.lock().expect("workflow ativo envenenado").id
    }

    /// Pasta do workflow ativo, ou o diretorio padrao se o workflow nao tiver uma valida.
    pub fn active_root(&self) -> PathBuf {
        let root = self
            .active
            .lock()
            .expect("workflow ativo envenenado")
            .root
            .clone();
        if root.as_os_str().is_empty() || !root.exists() {
            self.default_dir.clone()
        } else {
            root
        }
    }

    /// Carrega o workflow ativo do banco.
    pub async fn load_active(&self) -> Result<Workspace> {
        Ok(self.repo.load_workflow(self.active_id()).await?)
    }

    /// Troca o workflow ativo e persiste a escolha para o proximo boot.
    pub async fn set_active(&self, id: WorkspaceId, root: PathBuf) -> Result<()> {
        {
            let mut ativo = self.active.lock().expect("workflow ativo envenenado");
            ativo.id = id;
            ativo.root = root;
        }
        // Trocar de workflow zera o historico: undo/redo sao por workflow, nao globais.
        self.history.lock().expect("historico envenenado").clear();
        self.repo
            .set_setting(ACTIVE_WORKFLOW_KEY, &id.to_string())
            .await?;
        Ok(())
    }

    /// Resolve um caminho relativo dentro da pasta do workflow ativo.
    pub fn resolve_path(&self, relative: &Path) -> Result<PathBuf> {
        resolve_in(&self.active_root(), relative)
    }

    pub fn push_history(&self, comandos: Vec<Command>) {
        self.history
            .lock()
            .expect("historico envenenado")
            .push_group(comandos);
    }

    /// Aplica comandos de undo/redo e devolve o workflow recarregado.
    pub async fn aplicar_todos(&self, comandos: Vec<Command>) -> Result<Workspace> {
        let id = self.active_id();
        for comando in &comandos {
            // Nao aborta no primeiro erro: parar no meio deixaria o passo pela metade,
            // que e pior que aplicar o resto e registrar a falha.
            if let Err(erro) = self.repo.apply(id, comando).await {
                tracing::error!(%erro, "falha ao aplicar comando do historico");
            }
        }
        Ok(self.repo.load_workflow(id).await?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resolver(relativo: &str) -> Result<PathBuf> {
        resolve_in(Path::new("C:/orkai/workspace"), Path::new(relativo))
    }

    #[test]
    fn aceita_caminho_relativo_simples() {
        assert_eq!(
            resolver("notas/plano.md").unwrap(),
            PathBuf::from("C:/orkai/workspace").join("notas/plano.md")
        );
    }

    #[test]
    fn rejeita_travessia_de_diretorio() {
        for caminho in ["../segredo.md", "notas/../../segredo.md", "..\\segredo.md"] {
            assert!(
                matches!(resolver(caminho), Err(AppError::PathOutsideWorkspace(_))),
                "deveria rejeitar {caminho}"
            );
        }
    }

    #[test]
    fn rejeita_caminho_absoluto_e_vazio() {
        assert!(resolver("C:/Windows/System32/config/SAM").is_err());
        assert!(resolver("/etc/passwd").is_err());
        assert!(resolver("").is_err());
    }
}
