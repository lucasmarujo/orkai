use std::path::Path;
use std::str::FromStr;

use orkai_core::{Command, Connection, Node, NodeId, NodeKind, Size, Vec2, Viewport, Workspace};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::{Result, StorageError};

/// Tamanho usado quando o banco traz dimensoes invalidas. Perder a medida de um no
/// e aceitavel; perder o workspace inteiro por causa de uma linha ruim nao e.
const FALLBACK_SIZE: (f32, f32) = (420.0, 300.0);

/// Resumo de um workflow para a sidebar: sem carregar nos nem conexoes.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowSummary {
    pub id: Uuid,
    pub name: String,
    /// Pasta de projeto a que o workflow esta ligado. Vazio = pasta padrao do app.
    pub root_path: String,
}

/// `Clone` e barato: `SqlitePool` e um handle com `Arc` interno. A tarefa de
/// persistencia de output fica com sua propria copia.
#[derive(Clone)]
pub struct WorkspaceRepository {
    pool: SqlitePool,
}

impl WorkspaceRepository {
    /// Abre (ou cria) o banco no caminho informado e aplica as migrations.
    pub async fn open(path: impl AsRef<Path>) -> Result<Self> {
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true);
        Self::from_options(options, 5).await
    }

    /// Banco em memoria, para testes. Uma unica conexao: `:memory:` nao e compartilhado
    /// entre conexoes do pool.
    pub async fn in_memory() -> Result<Self> {
        let options = SqliteConnectOptions::from_str("sqlite::memory:")
            .expect("URL de memoria e valida")
            .foreign_keys(true);
        Self::from_options(options, 1).await
    }

    async fn from_options(options: SqliteConnectOptions, max_connections: u32) -> Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(max_connections)
            .connect_with(options)
            .await?;
        sqlx::migrate!("./migrations").run(&pool).await?;
        Ok(Self { pool })
    }

    /// Garante que exista ao menos um workflow e devolve o primeiro. Usado no startup:
    /// migra a instalacao antiga (workspace unico) para o modelo de workflows.
    pub async fn load_or_create(&self, default_name: &str) -> Result<Workspace> {
        if let Some(primeiro) = self.list_workflows().await?.first() {
            return self.load_workflow(primeiro.id).await;
        }
        let resumo = self.create_workflow(default_name, "").await?;
        self.load_workflow(resumo.id).await
    }

    /// Todos os workflows, em ordem de criacao. Alimenta a sidebar.
    pub async fn list_workflows(&self) -> Result<Vec<WorkflowSummary>> {
        let rows = sqlx::query("SELECT id, name, root_path FROM workspace ORDER BY rowid")
            .fetch_all(&self.pool)
            .await?;
        rows.into_iter()
            .map(|row| {
                Ok(WorkflowSummary {
                    id: Uuid::parse_str(row.get::<&str, _>("id"))?,
                    name: row.get("name"),
                    root_path: row.get("root_path"),
                })
            })
            .collect()
    }

    /// Cria um workflow ligado a uma pasta de projeto.
    pub async fn create_workflow(&self, name: &str, root_path: &str) -> Result<WorkflowSummary> {
        let workspace = Workspace::new(name);
        sqlx::query(
            "INSERT INTO workspace (id, name, pan_x, pan_y, zoom, root_path) \
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(workspace.id.to_string())
        .bind(&workspace.name)
        .bind(0.0_f64)
        .bind(0.0_f64)
        .bind(1.0_f64)
        .bind(root_path)
        .execute(&self.pool)
        .await?;

        Ok(WorkflowSummary {
            id: workspace.id,
            name: name.to_string(),
            root_path: root_path.into(),
        })
    }

    /// Carrega um workflow especifico, com seus nos e conexoes.
    pub async fn load_workflow(&self, id: Uuid) -> Result<Workspace> {
        let row = sqlx::query("SELECT name, pan_x, pan_y, zoom FROM workspace WHERE id = ?")
            .bind(id.to_string())
            .fetch_optional(&self.pool)
            .await?
            .ok_or_else(|| StorageError::WorkflowNotFound(id.to_string()))?;

        let pan = Vec2::new(
            row.get::<f64, _>("pan_x") as f32,
            row.get::<f64, _>("pan_y") as f32,
        )
        .unwrap_or(Vec2::ZERO);
        let viewport = Viewport::new(pan, 1.0)
            .expect("zoom 1.0 e sempre valido")
            .with_zoom_clamped(row.get::<f64, _>("zoom") as f32);

        Ok(Workspace {
            id,
            name: row.get("name"),
            viewport,
            nodes: self.load_nodes(id).await?,
            connections: self.load_connections(id).await?,
        })
    }

    /// Qual workflow contem um no. A comunicacao entre agentes (MCP) usa isto para
    /// resolver peers no workflow certo, mesmo que o usuario tenha trocado o ativo.
    pub async fn containing_workflow_id(&self, node_id: Uuid) -> Result<Option<Uuid>> {
        let row = sqlx::query("SELECT workspace_id FROM node WHERE id = ?")
            .bind(node_id.to_string())
            .fetch_optional(&self.pool)
            .await?;
        match row {
            Some(row) => Ok(Some(Uuid::parse_str(row.get::<&str, _>("workspace_id"))?)),
            None => Ok(None),
        }
    }

    pub async fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let row = sqlx::query("SELECT value FROM app_setting WHERE key = ?")
            .bind(key)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.map(|r| r.get::<String, _>("value")))
    }

    pub async fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        sqlx::query(
            "INSERT INTO app_setting (key, value) VALUES (?, ?) \
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        )
        .bind(key)
        .bind(value)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn load_nodes(&self, workspace_id: Uuid) -> Result<Vec<Node>> {
        let rows = sqlx::query(
            "SELECT id, kind_data, pos_x, pos_y, width, height, z_index, created_at \
             FROM node WHERE workspace_id = ? ORDER BY z_index",
        )
        .bind(workspace_id.to_string())
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| {
                let kind: NodeKind =
                    serde_json::from_str(row.get("kind_data")).map_err(|source| {
                        StorageError::Corrupted {
                            table: "node",
                            column: "kind_data",
                            source,
                        }
                    })?;

                let position = Vec2::new(
                    row.get::<f64, _>("pos_x") as f32,
                    row.get::<f64, _>("pos_y") as f32,
                )
                .unwrap_or(Vec2::ZERO);

                let (w, h) = (
                    row.get::<f64, _>("width") as f32,
                    row.get::<f64, _>("height") as f32,
                );
                let size = Size::new(w, h).unwrap_or_else(|_| {
                    tracing::warn!(
                        width = w,
                        height = h,
                        "tamanho invalido no banco, usando padrao"
                    );
                    Size::new(FALLBACK_SIZE.0, FALLBACK_SIZE.1).expect("fallback e valido")
                });

                Ok(Node {
                    id: Uuid::parse_str(row.get::<&str, _>("id"))?,
                    kind,
                    position,
                    size,
                    z_index: row.get("z_index"),
                    created_at: row.get("created_at"),
                })
            })
            .collect()
    }

    async fn load_connections(&self, workspace_id: Uuid) -> Result<Vec<Connection>> {
        let rows =
            sqlx::query("SELECT id, from_node, to_node FROM connection WHERE workspace_id = ?")
                .bind(workspace_id.to_string())
                .fetch_all(&self.pool)
                .await?;

        rows.into_iter()
            .map(|row| {
                Ok(Connection {
                    id: Uuid::parse_str(row.get::<&str, _>("id"))?,
                    from: Uuid::parse_str(row.get::<&str, _>("from_node"))?,
                    to: Uuid::parse_str(row.get::<&str, _>("to_node"))?,
                })
            })
            .collect()
    }

    pub async fn save_node(&self, workspace_id: Uuid, node: &Node) -> Result<()> {
        let kind_data =
            serde_json::to_string(&node.kind).map_err(|source| StorageError::Corrupted {
                table: "node",
                column: "kind_data",
                source,
            })?;

        sqlx::query(
            "INSERT INTO node (id, workspace_id, kind_tag, kind_data, pos_x, pos_y, width, height, z_index, created_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT (id) DO UPDATE SET \
               kind_tag = excluded.kind_tag, kind_data = excluded.kind_data, \
               pos_x = excluded.pos_x, pos_y = excluded.pos_y, \
               width = excluded.width, height = excluded.height, z_index = excluded.z_index",
        )
        .bind(node.id.to_string())
        .bind(workspace_id.to_string())
        .bind(node.kind.tag())
        .bind(kind_data)
        .bind(node.position.x as f64)
        .bind(node.position.y as f64)
        .bind(node.size.width as f64)
        .bind(node.size.height as f64)
        .bind(node.z_index)
        .bind(node.created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn delete_node(&self, id: NodeId) -> Result<()> {
        sqlx::query("DELETE FROM node WHERE id = ?")
            .bind(id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn save_connection(&self, workspace_id: Uuid, connection: &Connection) -> Result<()> {
        sqlx::query(
            "INSERT INTO connection (id, workspace_id, from_node, to_node) VALUES (?, ?, ?, ?) \
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(connection.id.to_string())
        .bind(workspace_id.to_string())
        .bind(connection.from.to_string())
        .bind(connection.to.to_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_connection(&self, id: Uuid) -> Result<()> {
        sqlx::query("DELETE FROM connection WHERE id = ?")
            .bind(id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Aplica um comando do historico ao banco.
    ///
    /// Undo e redo passam por aqui em vez de repetir a logica de cada mutacao: o
    /// comando ja descreve o estado final, entao um `match` resolve os dois sentidos.
    pub async fn apply(&self, workspace_id: Uuid, comando: &Command) -> Result<()> {
        match comando {
            Command::CreateNode { node } => self.save_node(workspace_id, node).await,
            Command::DeleteNode { node } => self.delete_node(node.id).await,
            Command::UpdateNodes { after, .. } => {
                for node in after {
                    self.save_node(workspace_id, node).await?;
                }
                Ok(())
            }
            Command::CreateConnection { connection } => {
                self.save_connection(workspace_id, connection).await
            }
            Command::DeleteConnection { connection } => self.delete_connection(connection.id).await,
        }
    }

    /// Grava (sobrescreve) o transcript de um no. Sem-op se o no nao existe mais:
    /// a tarefa de persistencia pode salvar uma ultima vez depois do delete.
    pub async fn save_output(&self, node_id: Uuid, data: &[u8]) -> Result<()> {
        sqlx::query(
            "INSERT INTO node_output (node_id, data, updated_at) VALUES (?, ?, ?) \
             ON CONFLICT (node_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        )
        .bind(node_id.to_string())
        .bind(data)
        .bind(now_ms())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Transcript persistido de um no, ou vazio se nunca houve.
    pub async fn load_output(&self, node_id: Uuid) -> Result<Vec<u8>> {
        let row = sqlx::query("SELECT data FROM node_output WHERE node_id = ?")
            .bind(node_id.to_string())
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.map(|r| r.get::<Vec<u8>, _>("data")).unwrap_or_default())
    }

    pub async fn save_viewport(&self, workspace_id: Uuid, viewport: &Viewport) -> Result<()> {
        sqlx::query("UPDATE workspace SET pan_x = ?, pan_y = ?, zoom = ? WHERE id = ?")
            .bind(viewport.pan.x as f64)
            .bind(viewport.pan.y as f64)
            .bind(viewport.zoom() as f64)
            .bind(workspace_id.to_string())
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn no(kind: NodeKind) -> Node {
        Node {
            id: Uuid::new_v4(),
            kind,
            position: Vec2::new(10.0, 20.0).unwrap(),
            size: Size::new(300.0, 200.0).unwrap(),
            z_index: 0,
            created_at: 1_700_000_000_000,
        }
    }

    fn markdown() -> Node {
        no(NodeKind::Markdown {
            file_path: PathBuf::from("notas.md"),
            color: String::new(),
        })
    }

    #[tokio::test]
    async fn workflows_isolam_nos_por_pasta() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let a = repo.create_workflow("Projeto A", "C:/dev/a").await.unwrap();
        let b = repo.create_workflow("Projeto B", "C:/dev/b").await.unwrap();
        assert_ne!(a.id, b.id);
        assert_eq!(a.root_path, "C:/dev/a");

        // Um no em A nao aparece em B.
        let node = markdown();
        repo.save_node(a.id, &node).await.unwrap();

        assert_eq!(repo.load_workflow(a.id).await.unwrap().nodes.len(), 1);
        assert!(repo.load_workflow(b.id).await.unwrap().nodes.is_empty());
    }

    #[tokio::test]
    async fn list_workflows_traz_todos_em_ordem() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        repo.create_workflow("Primeiro", "").await.unwrap();
        repo.create_workflow("Segundo", "").await.unwrap();
        let nomes: Vec<_> = repo
            .list_workflows()
            .await
            .unwrap()
            .into_iter()
            .map(|w| w.name)
            .collect();
        assert_eq!(nomes, vec!["Primeiro", "Segundo"]);
    }

    #[tokio::test]
    async fn containing_workflow_acha_o_dono_do_no() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let a = repo.create_workflow("A", "").await.unwrap();
        let node = markdown();
        repo.save_node(a.id, &node).await.unwrap();

        assert_eq!(
            repo.containing_workflow_id(node.id).await.unwrap(),
            Some(a.id)
        );
        assert_eq!(
            repo.containing_workflow_id(Uuid::new_v4()).await.unwrap(),
            None
        );
    }

    #[tokio::test]
    async fn setting_faz_round_trip() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        assert_eq!(repo.get_setting("x").await.unwrap(), None);
        repo.set_setting("x", "valor").await.unwrap();
        assert_eq!(repo.get_setting("x").await.unwrap(), Some("valor".into()));
        repo.set_setting("x", "novo").await.unwrap();
        assert_eq!(repo.get_setting("x").await.unwrap(), Some("novo".into()));
    }

    #[tokio::test]
    async fn cor_da_nota_sobrevive_ao_ciclo() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let ws = repo.create_workflow("A", "").await.unwrap();
        let node = no(NodeKind::Markdown {
            file_path: PathBuf::from("n.md"),
            color: "amber".into(),
        });
        repo.save_node(ws.id, &node).await.unwrap();

        let recarregado = &repo.load_workflow(ws.id).await.unwrap().nodes[0];
        let NodeKind::Markdown { color, .. } = &recarregado.kind else {
            panic!("deveria ser markdown");
        };
        assert_eq!(color, "amber");
    }

    fn agente() -> Node {
        no(NodeKind::Agent {
            name: "Claude".into(),
            role: "Architect".into(),
            command: "claude".into(),
            args: vec![],
            cwd: PathBuf::from("C:/dev"),
            system_prompt: String::new(),
        })
    }

    #[tokio::test]
    async fn output_faz_round_trip_e_e_sobrescrito() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let ws = repo.load_or_create("Orkai").await.unwrap();
        let node = agente();
        repo.save_node(ws.id, &node).await.unwrap();

        assert!(
            repo.load_output(node.id).await.unwrap().is_empty(),
            "sem output ainda"
        );

        // Bytes crus com escape ANSI: o transcript guarda a pintura, nao texto limpo.
        repo.save_output(node.id, b"\x1b[32mola\x1b[0m")
            .await
            .unwrap();
        assert_eq!(
            repo.load_output(node.id).await.unwrap(),
            b"\x1b[32mola\x1b[0m"
        );

        repo.save_output(node.id, b"novo").await.unwrap();
        assert_eq!(
            repo.load_output(node.id).await.unwrap(),
            b"novo",
            "sobrescreve, nao acumula"
        );
    }

    #[tokio::test]
    async fn output_some_quando_o_no_e_apagado() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let ws = repo.load_or_create("Orkai").await.unwrap();
        let node = agente();
        repo.save_node(ws.id, &node).await.unwrap();
        repo.save_output(node.id, b"transcript").await.unwrap();

        // CASCADE da migration, nao codigo de aplicacao.
        repo.delete_node(node.id).await.unwrap();
        assert!(repo.load_output(node.id).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn cria_workspace_na_primeira_abertura_e_reusa_depois() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let primeiro = repo.load_or_create("Orkai").await.unwrap();
        let segundo = repo.load_or_create("Ignorado").await.unwrap();
        assert_eq!(primeiro.id, segundo.id);
        assert_eq!(segundo.name, "Orkai");
    }

    #[tokio::test]
    async fn no_sobrevive_ao_ciclo_salvar_recarregar() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let ws = repo.load_or_create("Orkai").await.unwrap();
        let node = markdown();
        repo.save_node(ws.id, &node).await.unwrap();

        let recarregado = repo.load_or_create("Orkai").await.unwrap();
        assert_eq!(recarregado.nodes, vec![node]);
    }

    #[tokio::test]
    async fn mover_no_atualiza_em_vez_de_duplicar() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let ws = repo.load_or_create("Orkai").await.unwrap();
        let mut node = markdown();
        repo.save_node(ws.id, &node).await.unwrap();

        node.position = Vec2::new(999.0, -50.0).unwrap();
        repo.save_node(ws.id, &node).await.unwrap();

        let recarregado = repo.load_or_create("Orkai").await.unwrap();
        assert_eq!(recarregado.nodes.len(), 1);
        assert_eq!(recarregado.nodes[0].position, node.position);
    }

    #[tokio::test]
    async fn viewport_persiste_com_zoom() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let ws = repo.load_or_create("Orkai").await.unwrap();
        let viewport = Viewport::new(Vec2::new(-120.0, 80.0).unwrap(), 2.5).unwrap();
        repo.save_viewport(ws.id, &viewport).await.unwrap();

        assert_eq!(
            repo.load_or_create("Orkai").await.unwrap().viewport,
            viewport
        );
    }

    #[tokio::test]
    async fn deletar_no_remove_do_banco() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let ws = repo.load_or_create("Orkai").await.unwrap();
        let node = markdown();
        repo.save_node(ws.id, &node).await.unwrap();
        repo.delete_node(node.id).await.unwrap();

        assert!(repo.load_or_create("Orkai").await.unwrap().nodes.is_empty());
    }

    #[tokio::test]
    async fn conexao_persiste_e_e_removida() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let mut ws = repo.load_or_create("Orkai").await.unwrap();
        let (a, b) = (markdown(), markdown());
        repo.save_node(ws.id, &a).await.unwrap();
        repo.save_node(ws.id, &b).await.unwrap();

        ws.nodes = vec![a.clone(), b.clone()];
        let conexao = ws.add_connection(a.id, b.id).unwrap();
        repo.save_connection(ws.id, &conexao).await.unwrap();
        assert_eq!(
            repo.load_or_create("Orkai").await.unwrap().connections,
            vec![conexao.clone()]
        );

        repo.delete_connection(conexao.id).await.unwrap();
        assert!(repo
            .load_or_create("Orkai")
            .await
            .unwrap()
            .connections
            .is_empty());
    }

    #[tokio::test]
    async fn apagar_no_leva_junto_as_arestas_no_banco() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let mut ws = repo.load_or_create("Orkai").await.unwrap();
        let (a, b) = (markdown(), markdown());
        repo.save_node(ws.id, &a).await.unwrap();
        repo.save_node(ws.id, &b).await.unwrap();
        ws.nodes = vec![a.clone(), b.clone()];
        let conexao = ws.add_connection(a.id, b.id).unwrap();
        repo.save_connection(ws.id, &conexao).await.unwrap();

        repo.delete_node(a.id).await.unwrap();

        // Garantido pelo ON DELETE CASCADE da migration, nao por codigo de aplicacao.
        let recarregado = repo.load_or_create("Orkai").await.unwrap();
        assert!(recarregado.connections.is_empty());
        assert_eq!(recarregado.nodes.len(), 1);
    }

    #[tokio::test]
    async fn apply_desfaz_uma_criacao_e_refaz_depois() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let ws = repo.load_or_create("Orkai").await.unwrap();
        let node = markdown();

        let criar = Command::CreateNode { node: node.clone() };
        repo.apply(ws.id, &criar).await.unwrap();
        assert_eq!(repo.load_or_create("Orkai").await.unwrap().nodes.len(), 1);

        repo.apply(ws.id, &criar.inverse()).await.unwrap();
        assert!(repo.load_or_create("Orkai").await.unwrap().nodes.is_empty());

        repo.apply(ws.id, &criar).await.unwrap();
        assert_eq!(
            repo.load_or_create("Orkai").await.unwrap().nodes,
            vec![node]
        );
    }

    #[tokio::test]
    async fn apply_de_update_restaura_a_posicao_anterior() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let ws = repo.load_or_create("Orkai").await.unwrap();
        let antes = markdown();
        repo.save_node(ws.id, &antes).await.unwrap();

        let depois = Node {
            position: Vec2::new(900.0, 900.0).unwrap(),
            ..antes.clone()
        };
        let mover = Command::UpdateNodes {
            before: vec![antes.clone()],
            after: vec![depois.clone()],
        };

        repo.apply(ws.id, &mover).await.unwrap();
        assert_eq!(
            repo.load_or_create("Orkai").await.unwrap().nodes[0].position,
            depois.position
        );

        repo.apply(ws.id, &mover.inverse()).await.unwrap();
        assert_eq!(
            repo.load_or_create("Orkai").await.unwrap().nodes[0].position,
            antes.position
        );
    }

    #[tokio::test]
    async fn terminal_e_markdown_fazem_round_trip_preservando_o_tipo() {
        let repo = WorkspaceRepository::in_memory().await.unwrap();
        let ws = repo.load_or_create("Orkai").await.unwrap();
        let terminal = no(NodeKind::Terminal {
            cwd: PathBuf::from("C:/dev"),
            shell: "powershell.exe".into(),
        });
        repo.save_node(ws.id, &terminal).await.unwrap();
        repo.save_node(ws.id, &markdown()).await.unwrap();

        let tags: Vec<_> = repo
            .load_or_create("Orkai")
            .await
            .unwrap()
            .nodes
            .iter()
            .map(|n| n.kind.tag())
            .collect();
        assert!(tags.contains(&"terminal") && tags.contains(&"markdown"));
    }
}
