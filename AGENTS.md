# AGENTS.md

Guia para agentes de código que vão mexer no **Orkai**. Leia antes de tocar em
qualquer arquivo. O objetivo é simples: contribuir sem quebrar a arquitetura, os
padrões e as convenções que já existem. **O repositório é a fonte da verdade.**

---

## O que é o Orkai

Workspace visual open-source, **Windows-first**, para orquestração de agentes de IA.
Um canvas infinito onde terminais, notas e agentes de CLI são nós conectáveis. A
aresta entre dois nós é a **ACL**: um agente só vê e só fala com quem tem uma conexão.

Estado atual: **M4 — colaboração entre agentes** via servidor MCP embutido.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Shell desktop | **Tauri 2** (bundle `msi` + `nsis`, WebView2) |
| Frontend | **React 19** + **TypeScript 5.6** + **Vite 6** |
| Estado (UI) | **Zustand 5** |
| Terminal | **@xterm/xterm** (addons `fit` e `webgl`) |
| Markdown | **marked** + **dompurify** (sempre sanitizar) |
| Domínio | **Rust** (edition 2021, workspace Cargo, MSVC) |
| Persistência | **SQLite** via **sqlx** + migrations |
| Processos | **ConPTY** (crate `orkai-pty`) |
| Protocolo agentes | **MCP** (crate `orkai-mcp`) |
| Testes front | **Vitest** + **@testing-library/react** (jsdom) |
| Lint/format | ESLint 9 + typescript-eslint / `rustfmt` + `clippy` |

Requisitos de build: Windows 10/11 com WebView2, Rust (toolchain MSVC), Visual Studio
Build Tools 2022 (workload *Desenvolvimento para desktop com C++*), Node.js 22+.

---

## Arquitetura

Regra de ouro: **a fonte da verdade do estado vive no Rust** (ver `docs/adr/0002`).
O React é a camada de apresentação e interação; ele não é dono do modelo.

```
apps/desktop/              React + TypeScript + o binário Tauri
  src/                     Frontend
    canvas/                Canvas, viewport, seleção, snapping, virtualização
    nodes/                 Nós: Terminal, Markdown, Agent, Frame + registry
    stores/                Estado Zustand (workspace, workflow, roles, atividade)
    ipc/                   Ponte com o Rust: commands, types, base64, notify
    ui/                    Toolbar, painéis, diálogos, tema
  src-tauri/               Binário Tauri (Rust)
    src/commands.rs        Comandos expostos ao frontend (#[tauri::command])
    src/mcp_server.rs      Transporte HTTP do MCP
    src/state.rs           Estado da aplicação
crates/
  orkai-core/              Domínio puro: Workspace, Node, Connection, Viewport,
                           UndoStack. SEM I/O.
  orkai-storage/           SQLite via sqlx, migrations, WorkspaceRepository
  orkai-pty/               PtyBackend + implementação ConPTY, scrollback, registry
  orkai-mcp/               AgentBus, McpContext (ACL), protocolo MCP. Lógica pura;
                           o transporte HTTP mora no app.
docs/adr/                  Decisões de arquitetura (ADRs)
plans/                     Visão e plano de construção
```

### Separação de responsabilidades (respeitar sempre)

- **`orkai-core` não faz I/O.** Persistência é `orkai-storage`, processos são
  `orkai-pty`, protocolo é `orkai-mcp`. Não misture.
- **`orkai-mcp` é lógica pura.** O transporte (HTTP) fica no app (`mcp_server.rs`).
  A autorização vive no `McpContext`, implementado sobre o workspace no app.
- **Frontend fala com o backend só pelo `ipc/`.** Não espalhe `invoke` pelo código;
  passe por `src/ipc/commands.ts`.
- **Estrutura no SQLite, conteúdo no disco.** O banco guarda posição, tamanho e tipo;
  o conteúdo de uma nota é um arquivo `.md` de verdade (ver `docs/adr/0003`).

### ADRs — leia antes de mexer na área correspondente

- [ADR-001 — Canvas híbrido DOM + GPU](docs/adr/0001-canvas-hibrido-dom-gpu.md)
- [ADR-002 — Fonte da verdade no Rust](docs/adr/0002-estado-no-rust.md)
- [ADR-003 — SQLite para estrutura, disco para conteúdo](docs/adr/0003-sqlite-mais-arquivos.md)

---

## Convenções

### Idioma

- **Identificadores e comentários do código seguem o idioma já usado no arquivo.**
  O código deste projeto é escrito em **português** (ex.: `mostrarPainel`,
  `sidebarRecolhida`, `alternarTema`, `aoFechar`). Mantenha o padrão.
- **Não traduza** identificadores existentes.
- Nomes de domínio consolidados em inglês (`Workspace`, `Node`, `Connection`,
  `Viewport`, `AgentBus`) permanecem como estão.

### Frontend

- Componentes em `PascalCase.tsx`; lógica pura testável em arquivos `.ts` separados
  com seu `.test.ts` ao lado (padrão já presente: `selection.ts` + `selection.test.ts`).
- Estado global só via **Zustand** nas stores existentes. Não introduza outra lib
  de estado.
- Novo tipo de nó: registre em `src/nodes/registry.tsx` e siga o formato dos nós
  existentes (`TerminalNode`, `MarkdownNode`, `AgentNode`, `FrameNode`).
- Markdown **sempre** passa por `dompurify` antes de renderizar.
- Chamadas ao Rust só através de `src/ipc/`.

### Rust

- `edition = "2021"`, `rust-version = "1.77"`. Dependências compartilhadas ficam em
  `[workspace.dependencies]` no `Cargo.toml` raiz — reutilize, não redeclare versão.
- Erros: `thiserror` nas libs (cada crate tem seu `error.rs`), `anyhow` nas bordas.
- Novo comando Tauri: `#[tauri::command]` em `commands.rs`, registrado no handler, e
  exposto no front por `src/ipc/commands.ts` com o tipo em `src/ipc/types.ts`.
- Migration nova: arquivo numerado em `crates/orkai-storage/migrations/`
  (`000N_descricao.sql`). Nunca edite uma migration já aplicada.

---

## Verificação (rode antes de considerar pronto)

```powershell
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm test            # vitest

npm run build       # OBRIGATÓRIO antes do cargo: generate_context! lê o dist/
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

O CI (`.github/workflows/ci.yml`) roda exatamente isso em `windows-latest`, em dois
jobs (frontend e rust). Se passar local, passa no CI.

> **Nota de build local:** o `target/` do Cargo é redirecionado para fora do OneDrive
> por `.cargo/config.toml` (a sincronização trava a compilação). Esse arquivo existe só
> na máquina local — o CI o remove antes de compilar. Não versione caminhos de máquina.

---

## Regras de desenvolvimento (MUST)

1. **Segurança primeiro.** Não exponha dados sensíveis, não burle a ACL do canvas
   (a aresta autoriza a comunicação MCP), não relaxe a CSP do `tauri.conf.json`,
   sanitize toda entrada renderizada.
2. **Siga os padrões existentes** antes de qualquer preferência pessoal.
3. **Mudança mínima.** Menor diff possível, menor número de arquivos. Sem refactor
   oportunista, sem renomear arquivos sem necessidade.
4. **Reutilize.** Helper, tipo ou padrão que já existe no repo → use. Não reimplemente.
5. **Sem abstrações especulativas.** Nada de interface com uma implementação só,
   factory para um produto só, config para valor que nunca muda. (YAGNI)
6. **Toda mudança de lógica não trivial vem com teste**, no padrão já usado
   (`*.test.ts` ao lado no front; `cargo test` nas crates).
7. **Preserve compatibilidade.** Não mude contrato público (comandos IPC, protocolo
   MCP, schema do banco) sem necessidade real.
8. **Nada de nova arquitetura ou novo design pattern** sem pedido explícito.
9. **Não atualize dependências** a menos que seja o pedido.

## Never

- Introduzir nova arquitetura ou camada extra.
- Criar componente novo se já existe equivalente.
- Editar migration já aplicada.
- Espalhar `invoke` fora de `src/ipc/`.
- Colocar I/O em `orkai-core`.
- Colocar transporte/HTTP dentro de `orkai-mcp`.
- Renderizar Markdown sem sanitizar.
- Versionar `target/`, `dist/`, `node_modules/`, `.env` ou caminhos de máquina local.

---

## Fluxo de trabalho

1. Entenda o problema e leia os arquivos relacionados.
2. Procure implementação/padrão semelhante e reutilize.
3. Escreva o teste.
4. Implemente a menor mudança que resolve.
5. Rode a verificação completa acima.
6. Descreva o que mudou, os arquivos tocados e os riscos.

Se faltar informação, **pergunte** — não assuma em silêncio.
