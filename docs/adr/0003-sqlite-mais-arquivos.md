# ADR-003 — SQLite para estrutura, disco para conteúdo

**Status:** aceito · 2026-07-23

## Contexto

O princípio local-first do produto diz: "Markdown é Markdown, arquivos continuam arquivos, Git continua Git". Guardar o conteúdo das notas dentro do banco quebraria isso.

## Decisão

- **SQLite** (`sqlx`, migrations versionadas em `crates/orkai-storage/migrations/`) guarda estrutura: id, tipo, posição, tamanho, z-index, viewport, conexões.
- **Disco** guarda conteúdo: `.md` é um arquivo `.md` de verdade dentro de `%APPDATA%/dev.orkai.desktop/workspace`.
- `NodeKind` é serializado como JSON na coluna `kind_data`, com o discriminante desnormalizado em `kind_tag`. Tipo de nó novo não exige migration.
- `libSQL` foi descartado: replicação não faz sentido num produto sem nuvem.

## Consequências

- O usuário pode versionar o workspace com Git e abrir as notas em qualquer editor.
- Todo caminho vindo do front passa por `resolve_in` (`src-tauri/src/state.rs`), que rejeita caminho absoluto e `..` — fronteira de confiança do app.
- Linha corrompida no banco degrada só o nó afetado (tamanho cai para o padrão, com log), em vez de impedir a abertura do workspace.
