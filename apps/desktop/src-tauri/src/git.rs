//! Isolamento de agente por worktree git.
//!
//! Dois agentes na mesma pasta se atropelam: um edita o arquivo que o outro esta lendo,
//! e o resultado nao e revisavel. Cada agente ganha um worktree e uma branch propria —
//! trabalham em paralelo de verdade, e o humano integra ou descarta cada um.
//!
//! ponytail: chama o `git` do PATH em vez de linkar libgit2. Sem dependencia nova, e
//! todo alvo do Orkai (dev em Windows) ja tem git instalado.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use uuid::Uuid;

use crate::error::{AppError, Result};

/// Config gravada no worktree com o commit em que ele nasceu. E a partir dela que o
/// diff sabe o que e trabalho do agente — sem isso seria preciso guardar a base no
/// banco, e o `NodeKind::Agent` teria de mudar de formato.
const CONFIG_BASE: &str = "orkai.base";

/// Quanto o agente mexeu, em relacao ao commit base do worktree.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeStatus {
    pub branch: String,
    pub added: u32,
    pub removed: u32,
    /// Ha mudanca nao commitada — `integrar` so leva o que esta commitado.
    pub dirty: bool,
}

fn git(dir: &Path, args: &[&str]) -> Result<String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(dir).args(args);
    // Sem isto uma janela de console pisca a cada chamada — e o status roda em polling.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let saida = cmd
        .output()
        .map_err(|e| AppError::Internal(format!("falha ao chamar o git: {e}")))?;
    if !saida.status.success() {
        let erro = String::from_utf8_lossy(&saida.stderr).trim().to_string();
        return Err(AppError::Internal(format!(
            "git {}: {erro}",
            args.join(" ")
        )));
    }
    Ok(String::from_utf8_lossy(&saida.stdout).trim().to_string())
}

/// A pasta esta dentro de um repositorio git?
pub fn is_repo(dir: &Path) -> bool {
    dir.exists() && git(dir, &["rev-parse", "--git-dir"]).is_ok()
}

/// Cria um worktree novo a partir do HEAD de `root` e devolve a pasta criada.
///
/// Os worktrees ficam fora do repositorio (em `worktrees_dir`, dentro dos dados do app)
/// para nao poluir o projeto do usuario com pastas que o git ignora mas o editor mostra.
pub fn worktree_create(root: &Path, worktrees_dir: &Path, nome: &str) -> Result<PathBuf> {
    if !is_repo(root) {
        return Err(AppError::Internal(
            "a pasta do workflow nao e um repositorio git".into(),
        ));
    }
    let base = git(root, &["rev-parse", "HEAD"]).map_err(|_| {
        AppError::Internal("o repositorio ainda nao tem commits: faca o primeiro commit".into())
    })?;

    let slug = slug(nome);
    // Nome livre e o caso comum; a colisao (dois agentes com a mesma role) ganha sufixo.
    let slug = if git(root, &["rev-parse", "--verify", &format!("orkai/{slug}")]).is_ok() {
        format!("{slug}-{}", &Uuid::new_v4().to_string()[..6])
    } else {
        slug
    };
    let branch = format!("orkai/{slug}");
    let destino = worktrees_dir.join(&slug);

    std::fs::create_dir_all(worktrees_dir)?;
    let destino_str = destino.to_string_lossy().to_string();
    git(root, &["worktree", "add", &destino_str, "-b", &branch])?;
    git(&destino, &["config", CONFIG_BASE, &base])?;

    Ok(destino)
}

/// Status do worktree de um agente, ou `None` se a pasta nao for um worktree do Orkai.
pub fn status(dir: &Path) -> Option<WorktreeStatus> {
    let base = git(dir, &["config", "--get", CONFIG_BASE]).ok()?;
    let branch = git(dir, &["rev-parse", "--abbrev-ref", "HEAD"]).ok()?;
    // ponytail: `diff` cobre commitado + working tree, mas ignora arquivo novo nao
    // rastreado. Se contar untracked virar necessidade, e `git status --porcelain`.
    let resumo = git(dir, &["diff", "--shortstat", &base]).ok()?;
    let (added, removed) = parse_shortstat(&resumo);
    let dirty = !git(dir, &["status", "--porcelain"]).ok()?.is_empty();

    Some(WorktreeStatus {
        branch,
        added,
        removed,
        dirty,
    })
}

/// Um arquivo mexido, do jeito que o `GitNode` lista.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFile {
    pub path: String,
    /// Codigo do `git status --porcelain`: `M`, `A`, `D`, `R` ou `?` (nao rastreado).
    pub status: String,
    pub added: u32,
    pub removed: u32,
}

/// Tudo o que o `GitNode` precisa numa chamada so.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFiles {
    pub branch: String,
    pub dirty: bool,
    /// `true` quando a pasta e um worktree do Orkai: so ai integrar/descartar valem.
    pub is_worktree: bool,
    pub files: Vec<GitFile>,
}

/// Arquivos mexidos na pasta, com contagem por arquivo.
///
/// Duas fontes porque nenhuma sozinha basta: `status --porcelain` e a unica que
/// enxerga arquivo novo nao rastreado (o debito registrado em `status`), e `diff
/// --numstat` e a unica que traz `+N/-M`. A uniao e o que o humano espera ver.
pub fn status_files(dir: &Path) -> Result<GitFiles> {
    if !is_repo(dir) {
        return Err(AppError::Internal(
            "a pasta nao e um repositorio git".into(),
        ));
    }
    let branch = git(dir, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    let base = git(dir, &["config", "--get", CONFIG_BASE]).ok();
    let porcelain = git(dir, &["status", "--porcelain"])?;

    // Sem base (repositorio comum, nao worktree do Orkai) o diff e contra o HEAD.
    let alvo = base.clone().unwrap_or_else(|| "HEAD".into());
    let numstat = git(dir, &["diff", "--numstat", &alvo]).unwrap_or_default();
    let contagens = parse_numstat(&numstat);

    let mut files: Vec<GitFile> = parse_porcelain(&porcelain)
        .into_iter()
        .map(|(status, path)| {
            let (added, removed) = contagens
                .iter()
                .find(|(_, _, p)| *p == path)
                .map(|(a, r, _)| (*a, *r))
                .unwrap_or((0, 0));
            GitFile {
                path,
                status,
                added,
                removed,
            }
        })
        .collect();

    // Arquivo ja commitado na branch do agente nao aparece no porcelain (a working
    // tree esta limpa), mas e exatamente o trabalho que se quer revisar.
    for (added, removed, path) in contagens {
        if !files.iter().any(|f| f.path == path) {
            files.push(GitFile {
                path,
                status: "M".into(),
                added,
                removed,
            });
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(GitFiles {
        branch,
        dirty: !porcelain.is_empty(),
        is_worktree: base.is_some(),
        files,
    })
}

/// Diff unificado de um arquivo, contra a base do worktree (ou o HEAD).
pub fn file_diff(dir: &Path, path: &str) -> Result<String> {
    let alvo = git(dir, &["config", "--get", CONFIG_BASE]).unwrap_or_else(|_| "HEAD".into());
    let diff = git(dir, &["diff", &alvo, "--", path]).unwrap_or_default();
    if !diff.is_empty() {
        return Ok(diff);
    }

    // Arquivo nao rastreado nao tem diff nenhum. Sintetizar aqui evita `git add -N`,
    // que mexeria no index do repositorio do usuario so para exibir uma tela.
    match std::fs::read_to_string(dir.join(path)) {
        Ok(texto) => Ok(diff_de_arquivo_novo(path, &texto)),
        Err(_) => Ok(String::new()),
    }
}

/// Integra a branch do worktree no repositorio principal.
pub fn merge(dir: &Path) -> Result<String> {
    let status = status(dir)
        .ok_or_else(|| AppError::Internal("este agente nao esta num worktree do Orkai".into()))?;
    // Merge leva commits, nao working tree: integrar com mudanca solta perderia trabalho
    // silenciosamente, que e o pior desfecho possivel aqui.
    if status.dirty {
        return Err(AppError::Internal(
            "ha mudancas nao commitadas no worktree: commite antes de integrar".into(),
        ));
    }
    let principal = repo_principal(dir)?;
    git(&principal, &["merge", "--no-ff", &status.branch])
}

/// Remove o worktree e apaga a branch. Descarta o trabalho do agente.
pub fn worktree_remove(dir: &Path) -> Result<()> {
    let status =
        status(dir).ok_or_else(|| AppError::Internal("nao e um worktree do Orkai".into()))?;
    let principal = repo_principal(dir)?;

    git(
        &principal,
        &["worktree", "remove", "--force", &dir.to_string_lossy()],
    )?;
    git(&principal, &["branch", "-D", &status.branch])?;
    Ok(())
}

/// Pasta de trabalho do repositorio principal a que este worktree pertence.
fn repo_principal(dir: &Path) -> Result<PathBuf> {
    let comum = git(
        dir,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )?;
    Path::new(&comum)
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| AppError::Internal("repositorio principal nao encontrado".into()))
}

/// Nome de branch a partir do nome do agente: minusculo, sem acento nem espaco.
fn slug(nome: &str) -> String {
    let limpo: String = nome
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let partes: Vec<&str> = limpo.split('-').filter(|p| !p.is_empty()).collect();
    let slug = partes.join("-");
    if slug.is_empty() {
        "agente".into()
    } else {
        slug.chars().take(40).collect()
    }
}

/// Le a saida de `git status --porcelain` como `(codigo, caminho)`.
///
/// O formato tem duas colunas de status (index e working tree); vale a primeira
/// nao-branca, para `M ` e ` M` darem o mesmo `M`. Rename vem como `R  velho -> novo`
/// e interessa o destino, que e o arquivo que existe agora.
fn parse_porcelain(saida: &str) -> Vec<(String, String)> {
    saida
        .lines()
        .filter(|l| l.len() > 3)
        .map(|linha| {
            let (codigos, resto) = linha.split_at(2);
            let status = codigos.trim().chars().next().unwrap_or('?').to_string();
            // Caminho com espaco chega entre aspas; o `->` do rename separa origem
            // e destino. Nenhum dos dois pode virar parte do nome do arquivo.
            let caminho = resto.trim();
            let caminho = caminho.rsplit(" -> ").next().unwrap_or(caminho);
            (status, caminho.trim_matches('"').to_string())
        })
        .collect()
}

/// Le a saida de `git diff --numstat` como `(added, removed, caminho)`.
fn parse_numstat(saida: &str) -> Vec<(u32, u32, String)> {
    saida
        .lines()
        .filter_map(|linha| {
            let mut campos = linha.split('\t');
            let added = campos.next()?;
            let removed = campos.next()?;
            let caminho = campos.next()?;
            // Arquivo binario vem como `-\t-\tcaminho`: conta zero em vez de sumir
            // da lista, que e o unico jeito de o humano saber que ele mudou.
            Some((
                added.parse().unwrap_or(0),
                removed.parse().unwrap_or(0),
                caminho.trim().to_string(),
            ))
        })
        .collect()
}

/// Diff sintetico de um arquivo novo: tudo o que ele tem e adicao.
fn diff_de_arquivo_novo(path: &str, texto: &str) -> String {
    let linhas: Vec<&str> = texto.lines().collect();
    let cabecalho = format!(
        "--- /dev/null\n+++ b/{path}\n@@ -0,0 +1,{} @@",
        linhas.len()
    );
    if linhas.is_empty() {
        return cabecalho;
    }
    let corpo: String = linhas
        .iter()
        .map(|l| format!("\n+{l}"))
        .collect::<Vec<_>>()
        .join("");
    format!("{cabecalho}{corpo}")
}

/// Le ` 3 files changed, 12 insertions(+), 4 deletions(-)`.
fn parse_shortstat(linha: &str) -> (u32, u32) {
    let numero_antes = |marcador: &str| -> u32 {
        linha
            .split(',')
            .find(|parte| parte.contains(marcador))
            .and_then(|parte| parte.split_whitespace().next())
            .and_then(|n| n.parse().ok())
            .unwrap_or(0)
    };
    (numero_antes("insertion"), numero_antes("deletion"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_o_shortstat_do_git() {
        assert_eq!(
            parse_shortstat(" 3 files changed, 12 insertions(+), 4 deletions(-)"),
            (12, 4)
        );
        assert_eq!(parse_shortstat(" 1 file changed, 2 deletions(-)"), (0, 2));
        assert_eq!(parse_shortstat(" 1 file changed, 7 insertions(+)"), (7, 0));
        assert_eq!(parse_shortstat(""), (0, 0));
    }

    #[test]
    fn slug_vira_nome_de_branch_valido() {
        assert_eq!(slug("Claude Code · Reviewer"), "claude-code-reviewer");
        assert_eq!(slug("  "), "agente");
        assert_eq!(slug("Backend #1"), "backend-1");
        assert!(slug(&"x".repeat(80)).len() <= 40);
    }

    #[test]
    fn pasta_que_nao_e_repositorio_nao_passa_por_repo() {
        assert!(!is_repo(Path::new("C:/pasta/que/nao/existe")));
    }

    #[test]
    fn porcelain_normaliza_as_duas_colunas_de_status() {
        let saida = "M  src/lib.rs\n M src/git.rs\n?? novo.txt\nA  add.rs\nD  velho.rs";
        assert_eq!(
            parse_porcelain(saida),
            vec![
                ("M".to_string(), "src/lib.rs".to_string()),
                ("M".to_string(), "src/git.rs".to_string()),
                ("?".to_string(), "novo.txt".to_string()),
                ("A".to_string(), "add.rs".to_string()),
                ("D".to_string(), "velho.rs".to_string()),
            ]
        );
    }

    #[test]
    fn porcelain_le_rename_e_caminho_com_espaco() {
        assert_eq!(
            parse_porcelain("R  velho.rs -> src/novo.rs"),
            vec![("R".to_string(), "src/novo.rs".to_string())]
        );
        assert_eq!(
            parse_porcelain("?? \"com espaco.md\""),
            vec![("?".to_string(), "com espaco.md".to_string())]
        );
    }

    #[test]
    fn numstat_conta_binario_como_zero_sem_perder_o_arquivo() {
        let saida = "12\t4\tsrc/lib.rs\n-\t-\tlogo.png";
        assert_eq!(
            parse_numstat(saida),
            vec![
                (12, 4, "src/lib.rs".to_string()),
                (0, 0, "logo.png".to_string()),
            ]
        );
    }

    #[test]
    fn arquivo_novo_vira_diff_so_de_adicao() {
        let diff = diff_de_arquivo_novo("novo.md", "linha 1\nlinha 2");
        assert_eq!(
            diff,
            "--- /dev/null\n+++ b/novo.md\n@@ -0,0 +1,2 @@\n+linha 1\n+linha 2"
        );
    }

    #[test]
    fn arquivo_novo_vazio_nao_gera_linha_solta() {
        let diff = diff_de_arquivo_novo("vazio.md", "");
        assert_eq!(diff, "--- /dev/null\n+++ b/vazio.md\n@@ -0,0 +1,0 @@");
        assert!(!diff.ends_with('+'));
    }
}
