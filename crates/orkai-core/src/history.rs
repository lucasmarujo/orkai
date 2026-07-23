use serde::{Deserialize, Serialize};

use crate::{Connection, Node};

/// Mutacao reversivel do workspace.
///
/// Cada variante e o inverso exato de outra. Apagar um no com arestas nao vira um
/// comando gordo: vira um grupo (`UndoStack::push_group`) com um `DeleteConnection`
/// por aresta e o `DeleteNode` no fim, que o undo reverte na ordem certa.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Command {
    #[serde(rename_all = "camelCase")]
    CreateNode { node: Node },
    #[serde(rename_all = "camelCase")]
    DeleteNode { node: Node },
    /// Mover/redimensionar em lote. `before` e `after` descrevem os mesmos nos.
    #[serde(rename_all = "camelCase")]
    UpdateNodes { before: Vec<Node>, after: Vec<Node> },
    #[serde(rename_all = "camelCase")]
    CreateConnection { connection: Connection },
    #[serde(rename_all = "camelCase")]
    DeleteConnection { connection: Connection },
}

impl Command {
    /// Comando que anula este.
    pub fn inverse(&self) -> Command {
        match self {
            Self::CreateNode { node } => Self::DeleteNode { node: node.clone() },
            Self::DeleteNode { node } => Self::CreateNode { node: node.clone() },
            Self::UpdateNodes { before, after } => Self::UpdateNodes {
                before: after.clone(),
                after: before.clone(),
            },
            Self::CreateConnection { connection } => Self::DeleteConnection {
                connection: connection.clone(),
            },
            Self::DeleteConnection { connection } => Self::CreateConnection {
                connection: connection.clone(),
            },
        }
    }
}

/// Pilha de undo/redo.
///
/// Guarda comandos, nao snapshots do workspace: um workspace com mil nos snapshotado
/// a cada arrasto encheria a memoria sem necessidade.
#[derive(Debug)]
pub struct UndoStack {
    feitos: Vec<Vec<Command>>,
    desfeitos: Vec<Vec<Command>>,
    capacidade: usize,
}

impl UndoStack {
    pub const DEFAULT_CAPACITY: usize = 200;

    pub fn new(capacidade: usize) -> Self {
        Self {
            feitos: Vec::new(),
            desfeitos: Vec::new(),
            capacidade: capacidade.max(1),
        }
    }

    /// Registra um comando isolado.
    pub fn push(&mut self, comando: Command) {
        self.push_group(vec![comando]);
    }

    /// Registra varios comandos como um passo unico de undo.
    ///
    /// Apagar um no com arestas e um passo so para o usuario, mesmo sendo N mutacoes.
    pub fn push_group(&mut self, comandos: Vec<Command>) {
        if comandos.is_empty() {
            return;
        }
        // Uma acao nova invalida o caminho de redo — comportamento padrao de editor.
        self.desfeitos.clear();
        self.feitos.push(comandos);
        if self.feitos.len() > self.capacidade {
            self.feitos.remove(0);
        }
    }

    /// Devolve os comandos a aplicar para desfazer, ja invertidos e em ordem reversa.
    pub fn undo(&mut self) -> Option<Vec<Command>> {
        let grupo = self.feitos.pop()?;
        let inversos = grupo.iter().rev().map(Command::inverse).collect();
        self.desfeitos.push(grupo);
        Some(inversos)
    }

    /// Devolve os comandos a reaplicar.
    pub fn redo(&mut self) -> Option<Vec<Command>> {
        let grupo = self.desfeitos.pop()?;
        self.feitos.push(grupo.clone());
        Some(grupo)
    }

    pub fn can_undo(&self) -> bool {
        !self.feitos.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.desfeitos.is_empty()
    }

    /// Esvazia o historico. Usado ao trocar de workflow: undo/redo sao por workflow.
    pub fn clear(&mut self) {
        self.feitos.clear();
        self.desfeitos.clear();
    }
}

impl Default for UndoStack {
    fn default() -> Self {
        Self::new(Self::DEFAULT_CAPACITY)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use uuid::Uuid;

    use super::*;
    use crate::{NodeKind, Size, Vec2};

    fn no(x: f32) -> Node {
        Node {
            id: Uuid::nil(),
            kind: NodeKind::Markdown {
                file_path: PathBuf::from("a.md"),
                color: String::new(),
            },
            position: Vec2::new(x, 0.0).unwrap(),
            size: Size::new(200.0, 200.0).unwrap(),
            z_index: 0,
            created_at: 0,
        }
    }

    fn conexao() -> Connection {
        Connection {
            id: Uuid::nil(),
            from: Uuid::nil(),
            to: Uuid::nil(),
        }
    }

    #[test]
    fn inverso_de_criar_e_apagar_e_vice_versa() {
        let criar = Command::CreateNode { node: no(0.0) };
        assert!(matches!(criar.inverse(), Command::DeleteNode { .. }));

        let apagar = Command::DeleteNode { node: no(0.0) };
        assert!(matches!(apagar.inverse(), Command::CreateNode { .. }));
    }

    #[test]
    fn inverso_de_update_troca_antes_e_depois() {
        let cmd = Command::UpdateNodes {
            before: vec![no(0.0)],
            after: vec![no(50.0)],
        };
        let Command::UpdateNodes { before, after } = cmd.inverse() else {
            panic!("deveria continuar sendo UpdateNodes");
        };
        assert_eq!(before[0].position.x, 50.0);
        assert_eq!(after[0].position.x, 0.0);
    }

    #[test]
    fn inverso_aplicado_duas_vezes_volta_ao_original() {
        let cmd = Command::UpdateNodes {
            before: vec![no(0.0)],
            after: vec![no(50.0)],
        };
        assert_eq!(cmd.inverse().inverse(), cmd);

        let conn = Command::CreateConnection {
            connection: conexao(),
        };
        assert_eq!(conn.inverse().inverse(), conn);
    }

    #[test]
    fn undo_devolve_inversos_e_redo_devolve_os_originais() {
        let mut stack = UndoStack::default();
        let cmd = Command::CreateConnection {
            connection: conexao(),
        };
        stack.push(cmd.clone());

        let desfazer = stack.undo().expect("ha o que desfazer");
        assert!(matches!(desfazer[0], Command::DeleteConnection { .. }));
        assert!(!stack.can_undo());
        assert!(stack.can_redo());

        assert_eq!(stack.redo().unwrap(), vec![cmd]);
        assert!(stack.can_undo());
        assert!(!stack.can_redo());
    }

    #[test]
    fn grupo_desfaz_em_ordem_reversa() {
        let mut stack = UndoStack::default();
        stack.push_group(vec![
            Command::CreateNode { node: no(0.0) },
            Command::CreateConnection {
                connection: conexao(),
            },
        ]);

        let desfazer = stack.undo().unwrap();
        // A aresta some antes do no: o contrario deixaria aresta orfa no meio do passo.
        assert!(matches!(desfazer[0], Command::DeleteConnection { .. }));
        assert!(matches!(desfazer[1], Command::DeleteNode { .. }));
    }

    #[test]
    fn acao_nova_invalida_o_redo() {
        let mut stack = UndoStack::default();
        stack.push(Command::CreateNode { node: no(0.0) });
        stack.undo();
        assert!(stack.can_redo());

        stack.push(Command::CreateNode { node: no(10.0) });
        assert!(!stack.can_redo());
    }

    #[test]
    fn pilha_vazia_nao_entra_em_panico() {
        let mut stack = UndoStack::default();
        assert!(stack.undo().is_none());
        assert!(stack.redo().is_none());
        assert!(!stack.can_undo() && !stack.can_redo());
    }

    #[test]
    fn grupo_vazio_e_ignorado() {
        let mut stack = UndoStack::default();
        stack.push_group(vec![]);
        assert!(!stack.can_undo());
    }

    #[test]
    fn descarta_o_mais_antigo_ao_estourar_a_capacidade() {
        let mut stack = UndoStack::new(2);
        for x in 0..5 {
            stack.push(Command::CreateNode { node: no(x as f32) });
        }
        assert_eq!(stack.feitos.len(), 2);
        // Sobraram os dois ultimos.
        let Command::CreateNode { node } = &stack.feitos[1][0] else {
            panic!()
        };
        assert_eq!(node.position.x, 4.0);
    }
}
