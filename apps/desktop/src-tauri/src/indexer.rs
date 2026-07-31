//! Coleta dos arquivos do workflow para o indice de busca do M6.
//!
//! ponytail: reindexa a pasta inteira quando o palette abre, em vez de observar o
//! disco com `notify` e manter indice incremental. O corpus e os arquivos de texto
//! de um workflow — um `read_dir` recursivo mais uma transacao. Se passar de alguns
//! milhares de arquivos e a abertura do palette pesar, o upgrade path e o watcher.

use std::path::Path;

use orkai_storage::SearchDoc;

/// Extensoes que valem indexar. Binario e bundle minificado so poluem o indice com
/// tokens que ninguem procura.
const EXTENSOES: &[&str] = &[
    "md", "txt", "rs", "ts", "tsx", "js", "jsx", "json", "toml", "css", "html", "sql", "yml",
    "yaml",
];

/// Pastas que nunca sao conteudo do usuario. `worktrees` e nossa: indexa-la faria
/// cada arquivo do projeto aparecer uma vez por agente.
const IGNORAR: &[&str] = &[".git", "node_modules", "target", "dist", "worktrees"];

/// Acima disto e log ou dado gerado, nao algo que alguem escreveu para reler.
const TAMANHO_MAX: u64 = 512 * 1024;

/// Teto de arquivos por workflow. Uma pasta gigante nao pode travar a abertura do
/// palette — melhor indexar parte do que nao abrir.
const ARQUIVOS_MAX: usize = 5_000;

/// Todos os arquivos de texto sob `root`, com caminho relativo a ele.
pub fn coletar(root: &Path) -> Vec<SearchDoc> {
    let mut docs = Vec::new();
    if root.exists() {
        visitar(root, root, &mut docs);
    }
    docs
}

fn visitar(root: &Path, dir: &Path, docs: &mut Vec<SearchDoc>) {
    if docs.len() >= ARQUIVOS_MAX {
        return;
    }
    // Pasta ilegivel (permissao, link quebrado) e pulada: indexar o que da e melhor
    // do que falhar a busca inteira por causa de um galho.
    let Ok(entradas) = std::fs::read_dir(dir) else {
        return;
    };

    for entrada in entradas.flatten() {
        if docs.len() >= ARQUIVOS_MAX {
            return;
        }
        let caminho = entrada.path();
        let nome = entrada.file_name();
        let nome = nome.to_string_lossy();

        if caminho.is_dir() {
            if !IGNORAR.contains(&nome.as_ref()) {
                visitar(root, &caminho, docs);
            }
            continue;
        }

        if !indexavel(&caminho) {
            continue;
        }
        // Nao-UTF8 vira `None` e e pulado: sao arquivos com extensao de texto mas
        // conteudo binario, que so entrariam no indice como ruido.
        if let Ok(body) = std::fs::read_to_string(&caminho) {
            docs.push(SearchDoc {
                path: relativo(root, &caminho),
                body,
            });
        }
    }
}

fn indexavel(caminho: &Path) -> bool {
    let extensao_ok = caminho
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| EXTENSOES.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false);
    let tamanho_ok = std::fs::metadata(caminho)
        .map(|m| m.len() <= TAMANHO_MAX)
        .unwrap_or(false);
    extensao_ok && tamanho_ok
}

/// Caminho relativo ao root, sempre com `/`: e assim que o front monta o `filePath`
/// de uma nota, e o Windows aceita as duas barras.
fn relativo(root: &Path, caminho: &Path) -> String {
    caminho
        .strip_prefix(root)
        .unwrap_or(caminho)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

/// Traduz o que o usuario digitou para a linguagem de query do FTS5.
///
/// Fronteira de confianca: `"`, `*`, `-`, `:`, `^`, `NEAR`, `AND` e `OR` sao
/// operadores dentro do `MATCH`. Texto cru gera erro de sintaxe no melhor caso e
/// consulta com semantica alheia no pior. Cada termo vai entre aspas (com as aspas
/// internas dobradas, o escape do proprio FTS5) e o ultimo ganha `*`, para o
/// resultado aparecer enquanto se digita.
pub fn fts_query(entrada: &str) -> String {
    let termos: Vec<String> = entrada
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{}\"", t.replace('"', "\"\"")))
        .collect();

    match termos.split_last() {
        None => String::new(),
        Some((ultimo, resto)) => {
            let mut query = resto.join(" ");
            if !query.is_empty() {
                query.push(' ');
            }
            query.push_str(ultimo);
            query.push('*');
            query
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    /// Pasta temporaria propria por teste, no molde de `mcp_server.rs`.
    fn pasta_temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("orkai-indexer-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn escrever(dir: &Path, relativo: &str, conteudo: &str) {
        let caminho = dir.join(relativo);
        std::fs::create_dir_all(caminho.parent().unwrap()).unwrap();
        std::fs::write(caminho, conteudo).unwrap();
    }

    #[test]
    fn fts_query_escapa_termos_e_deixa_o_ultimo_como_prefixo() {
        assert_eq!(fts_query("carregar sessao"), "\"carregar\" \"sessao\"*");
        assert_eq!(fts_query("plano"), "\"plano\"*");
    }

    #[test]
    fn fts_query_neutraliza_os_operadores_do_fts5() {
        // Sem escapar, cada um destes mudaria a semantica da consulta ou quebraria.
        assert_eq!(fts_query("a OR b"), "\"a\" \"OR\" \"b\"*");
        assert_eq!(fts_query("-nota"), "\"nota\"*");
        assert_eq!(fts_query("path:src"), "\"path\" \"src\"*");
        assert_eq!(fts_query("diz \"oi\""), "\"diz\" \"oi\"*");
    }

    #[test]
    fn fts_query_vazia_para_entrada_sem_termo() {
        assert_eq!(fts_query(""), "");
        assert_eq!(fts_query("   "), "");
        assert_eq!(fts_query("\"*-:^"), "");
    }

    #[test]
    fn coletar_pega_texto_e_devolve_caminho_relativo() {
        let dir = pasta_temp();
        escrever(&dir, "notas/plano.md", "conteudo");
        escrever(&dir, "src/lib.rs", "fn main() {}");

        let mut caminhos: Vec<String> = coletar(&dir).into_iter().map(|d| d.path).collect();
        caminhos.sort();
        assert_eq!(caminhos, vec!["notas/plano.md", "src/lib.rs"]);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn coletar_pula_pastas_ignoradas_e_extensoes_de_fora() {
        let dir = pasta_temp();
        escrever(&dir, "ok.md", "vale");
        escrever(&dir, "node_modules/pacote/index.js", "nao vale");
        escrever(&dir, ".git/COMMIT_EDITMSG", "nao vale");
        escrever(&dir, "target/build.rs", "nao vale");
        escrever(&dir, "foto.png", "nao vale");

        let caminhos: Vec<String> = coletar(&dir).into_iter().map(|d| d.path).collect();
        assert_eq!(caminhos, vec!["ok.md"]);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn coletar_pula_arquivo_acima_do_teto_de_tamanho() {
        let dir = pasta_temp();
        escrever(&dir, "pequeno.md", "ok");
        escrever(&dir, "gigante.md", &"x".repeat(TAMANHO_MAX as usize + 1));

        let caminhos: Vec<String> = coletar(&dir).into_iter().map(|d| d.path).collect();
        assert_eq!(caminhos, vec!["pequeno.md"]);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn coletar_em_pasta_inexistente_devolve_vazio() {
        assert!(coletar(Path::new("C:/pasta/que/nao/existe")).is_empty());
    }
}
