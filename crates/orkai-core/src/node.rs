use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{Size, Vec2};

pub type NodeId = Uuid;

/// Tipo do no e os dados especificos dele.
///
/// Tagged enum: serializa como `{ "type": "terminal", "cwd": "...", "shell": "..." }`,
/// que e o formato que o front consome direto.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum NodeKind {
    #[serde(rename_all = "camelCase")]
    Terminal { cwd: PathBuf, shell: String },
    #[serde(rename_all = "camelCase")]
    Markdown {
        file_path: PathBuf,
        /// Cor da nota (nome de tema, ex. "amber"). `default` para nao quebrar a
        /// desserializacao das notas criadas antes deste campo existir.
        #[serde(default)]
        color: String,
    },
    /// Moldura de agrupamento. Nao tem pai/filho no modelo: o conteudo e quem esta
    /// geometricamente dentro (ver `Workspace::nodes_inside`), como em Figma e tldraw.
    #[serde(rename_all = "camelCase")]
    Frame { title: String },
    /// Agente de IA de linha de comando (Claude Code, Codex, Aider) rodando num PTY.
    ///
    /// `role` e `String`, nao enum: o catalogo de roles e dado de configuracao (perfis),
    /// nao invariante de dominio. Enum travaria roles customizadas e forcaria migracao a
    /// cada uma nova.
    #[serde(rename_all = "camelCase")]
    Agent {
        name: String,
        role: String,
        command: String,
        args: Vec<String>,
        cwd: PathBuf,
        system_prompt: String,
    },
}

impl NodeKind {
    /// Discriminante estavel usado como chave no banco e no registry do front.
    pub fn tag(&self) -> &'static str {
        match self {
            Self::Terminal { .. } => "terminal",
            Self::Markdown { .. } => "markdown",
            Self::Frame { .. } => "frame",
            Self::Agent { .. } => "agent",
        }
    }

    /// Como iniciar o processo deste no, quando ele tem um: `(comando, args, cwd)`.
    /// Terminal e Agent sao spawnaveis; Markdown e Frame nao.
    pub fn spawn_spec(&self) -> Option<(&str, &[String], &std::path::Path)> {
        match self {
            Self::Terminal { cwd, shell } => Some((shell, &[], cwd)),
            Self::Agent {
                command, args, cwd, ..
            } => Some((command, args, cwd)),
            Self::Markdown { .. } | Self::Frame { .. } => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: NodeId,
    pub kind: NodeKind,
    pub position: Vec2,
    pub size: Size,
    pub z_index: i32,
    /// Milissegundos desde a epoch Unix.
    pub created_at: i64,
}

impl Node {
    /// Retangulo do no no espaco do mundo: `(x_min, y_min, x_max, y_max)`.
    pub fn bounds(&self) -> (f32, f32, f32, f32) {
        (
            self.position.x,
            self.position.y,
            self.position.x + self.size.width,
            self.position.y + self.size.height,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_markdown() -> Node {
        Node {
            id: Uuid::nil(),
            kind: NodeKind::Markdown {
                file_path: PathBuf::from("notas.md"),
                color: String::new(),
            },
            position: Vec2::new(10.0, 20.0).unwrap(),
            size: Size::new(300.0, 200.0).unwrap(),
            z_index: 0,
            created_at: 0,
        }
    }

    #[test]
    fn bounds_soma_tamanho_a_posicao() {
        assert_eq!(no_markdown().bounds(), (10.0, 20.0, 310.0, 220.0));
    }

    #[test]
    fn kind_serializa_com_tag_discriminante() {
        let json = serde_json::to_value(&no_markdown().kind).unwrap();
        assert_eq!(json["type"], "markdown");
        assert_eq!(json["filePath"], "notas.md");
    }

    #[test]
    fn faz_round_trip_json() {
        let node = no_markdown();
        let json = serde_json::to_string(&node).unwrap();
        assert_eq!(node, serde_json::from_str::<Node>(&json).unwrap());
    }

    #[test]
    fn tag_bate_com_a_serializacao() {
        for kind in [
            NodeKind::Terminal {
                cwd: PathBuf::from("."),
                shell: "pwsh".into(),
            },
            NodeKind::Markdown {
                file_path: PathBuf::from("a.md"),
                color: String::new(),
            },
            NodeKind::Frame {
                title: "Backend".into(),
            },
            NodeKind::Agent {
                name: "Claude".into(),
                role: "Architect".into(),
                command: "claude".into(),
                args: vec!["--print".into()],
                cwd: PathBuf::from("C:/dev"),
                system_prompt: "Voce e um arquiteto.".into(),
            },
        ] {
            let json = serde_json::to_value(&kind).unwrap();
            assert_eq!(json["type"], kind.tag());
        }
    }

    #[test]
    fn agent_faz_round_trip_e_e_spawnavel() {
        let kind = NodeKind::Agent {
            name: "Claude".into(),
            role: "Reviewer".into(),
            command: "claude".into(),
            args: vec!["--model".into(), "opus".into()],
            cwd: PathBuf::from("C:/proj"),
            system_prompt: String::new(),
        };
        let json = serde_json::to_string(&kind).unwrap();
        assert_eq!(kind, serde_json::from_str::<NodeKind>(&json).unwrap());

        let (cmd, args, cwd) = kind.spawn_spec().expect("agente e spawnavel");
        assert_eq!(cmd, "claude");
        assert_eq!(args, ["--model", "opus"]);
        assert_eq!(cwd, std::path::Path::new("C:/proj"));
    }

    #[test]
    fn markdown_e_frame_nao_sao_spawnaveis() {
        assert!(no_markdown().kind.spawn_spec().is_none());
        assert!(NodeKind::Frame { title: "g".into() }.spawn_spec().is_none());
    }

    #[test]
    fn terminal_e_spawnavel_sem_args() {
        let kind = NodeKind::Terminal {
            cwd: PathBuf::from("."),
            shell: "pwsh.exe".into(),
        };
        let (cmd, args, _) = kind.spawn_spec().unwrap();
        assert_eq!(cmd, "pwsh.exe");
        assert!(args.is_empty());
    }
}
