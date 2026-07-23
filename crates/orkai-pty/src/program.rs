use std::path::{Path, PathBuf};

/// Como executar um programa encontrado no PATH.
///
/// No Windows, um CLI instalado por npm vira tres arquivos: um script bash sem extensao,
/// um `.cmd` e um `.ps1`. O `CreateProcessW` so executa binarios nativos — apontar para o
/// script bash falha com "%1 nao e um aplicativo Win32 valido" (os error 193). Por isso a
/// resolucao precisa respeitar PATHEXT e saber quando delegar ao `cmd.exe`.
#[derive(Debug, Clone, PartialEq)]
pub enum Program {
    /// Binario nativo (`.exe`, `.com`): roda direto.
    Direct(PathBuf),
    /// Script de shell do Windows (`.cmd`, `.bat`): precisa de `cmd.exe /c`.
    Shim(PathBuf),
}

impl Program {
    /// Comando e argumentos finais para o spawn, ja embrulhando o shim quando preciso.
    pub fn command_line(&self, args: &[String]) -> (String, Vec<String>) {
        match self {
            Self::Direct(caminho) => (caminho.to_string_lossy().into_owned(), args.to_vec()),
            Self::Shim(caminho) => {
                // ponytail: argumentos passam pela analise do cmd.exe. Hoje so o Claude
                // recebe JSON (--mcp-config) e ele resolve como .exe, entao nao passa por
                // aqui. Se um provider com shim precisar de JSON, escrever num arquivo
                // temporario e passar o caminho.
                let mut finais = vec!["/c".to_string(), caminho.to_string_lossy().into_owned()];
                finais.extend_from_slice(args);
                ("cmd.exe".to_string(), finais)
            }
        }
    }
}

/// Extensoes tentadas, na ordem, quando o nome vem sem uma.
const EXTENSOES: [&str; 4] = ["exe", "com", "cmd", "bat"];

fn classificar(caminho: PathBuf) -> Program {
    let ext = caminho
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match ext.as_str() {
        "cmd" | "bat" => Program::Shim(caminho),
        _ => Program::Direct(caminho),
    }
}

/// Resolve um nome de comando contra uma lista de diretorios.
///
/// Separado de [`resolve`] para ser testavel sem tocar no disco: `existe` decide o que
/// existe. Segue a semantica do Windows — percorre os diretorios em ordem e, dentro de
/// cada um, as extensoes em ordem.
pub(crate) fn resolve_with(
    name: &str,
    dirs: &[PathBuf],
    existe: impl Fn(&Path) -> bool,
) -> Option<Program> {
    if name.is_empty() {
        return None;
    }

    // Nome com separador ou com extensao ja e um caminho: nao procura no PATH.
    let como_caminho = Path::new(name);
    if como_caminho.components().count() > 1 || como_caminho.extension().is_some() {
        return existe(como_caminho).then(|| classificar(como_caminho.to_path_buf()));
    }

    for dir in dirs {
        for ext in EXTENSOES {
            let candidato = dir.join(format!("{name}.{ext}"));
            if existe(&candidato) {
                return Some(classificar(candidato));
            }
        }
    }
    None
}

/// Resolve um comando no PATH do processo. `None` quando nao ha executavel utilizavel.
pub fn resolve(name: &str) -> Option<Program> {
    let dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    resolve_with(name, &dirs, |c| c.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dirs() -> Vec<PathBuf> {
        vec![PathBuf::from("C:/bin"), PathBuf::from("C:/nodejs")]
    }

    /// Simula a maquina real: claude e .exe; opencode so tem .cmd (mais o script bash
    /// sem extensao, que nao deve ser escolhido).
    fn existe(c: &Path) -> bool {
        let s = c.to_string_lossy().replace('\\', "/");
        matches!(
            s.as_str(),
            "C:/bin/claude.exe"
                | "C:/nodejs/opencode.cmd"
                | "C:/nodejs/opencode"
                | "C:/bin/tool.bat"
        )
    }

    #[test]
    fn acha_exe_e_roda_direto() {
        let p = resolve_with("claude", &dirs(), existe).unwrap();
        assert_eq!(p, Program::Direct(PathBuf::from("C:/bin/claude.exe")));

        let (cmd, args) = p.command_line(&["--print".into()]);
        assert!(cmd.ends_with("claude.exe"));
        assert_eq!(args, ["--print"]);
    }

    #[test]
    fn cli_de_npm_resolve_para_cmd_e_passa_pelo_cmd_exe() {
        // Regressao: apontar para "C:/nodejs/opencode" (script bash) dava os error 193.
        let p = resolve_with("opencode", &dirs(), existe).unwrap();
        assert_eq!(p, Program::Shim(PathBuf::from("C:/nodejs/opencode.cmd")));

        let (cmd, args) = p.command_line(&["run".into()]);
        assert_eq!(cmd, "cmd.exe");
        assert_eq!(args[0], "/c");
        // `join` usa o separador nativo; compara normalizado.
        assert_eq!(args[1].replace('\\', "/"), "C:/nodejs/opencode.cmd");
        assert_eq!(args[2], "run");
    }

    #[test]
    fn bat_tambem_e_shim() {
        assert_eq!(
            resolve_with("tool", &dirs(), existe),
            Some(Program::Shim(PathBuf::from("C:/bin/tool.bat")))
        );
    }

    #[test]
    fn comando_inexistente_devolve_none() {
        assert_eq!(resolve_with("codex", &dirs(), existe), None);
        assert_eq!(resolve_with("", &dirs(), existe), None);
    }

    #[test]
    fn caminho_completo_nao_procura_no_path() {
        assert_eq!(
            resolve_with("C:/bin/claude.exe", &dirs(), existe),
            Some(Program::Direct(PathBuf::from("C:/bin/claude.exe")))
        );
        assert_eq!(resolve_with("C:/nao/existe.exe", &dirs(), existe), None);
    }

    #[test]
    fn respeita_a_ordem_dos_diretorios_do_path() {
        let ordem_invertida = vec![PathBuf::from("C:/nodejs"), PathBuf::from("C:/bin")];
        // Existe nos dois; vence o primeiro diretorio da lista.
        let existe_nos_dois = |c: &Path| {
            let s = c.to_string_lossy().replace('\\', "/");
            s == "C:/bin/dup.exe" || s == "C:/nodejs/dup.exe"
        };
        assert_eq!(
            resolve_with("dup", &ordem_invertida, existe_nos_dois),
            Some(Program::Direct(PathBuf::from("C:/nodejs/dup.exe")))
        );
    }

    #[test]
    fn exe_tem_prioridade_sobre_cmd_no_mesmo_diretorio() {
        let ambos = |c: &Path| {
            let s = c.to_string_lossy().replace('\\', "/");
            s == "C:/bin/x.exe" || s == "C:/bin/x.cmd"
        };
        assert_eq!(
            resolve_with("x", &dirs(), ambos),
            Some(Program::Direct(PathBuf::from("C:/bin/x.exe")))
        );
    }
}
