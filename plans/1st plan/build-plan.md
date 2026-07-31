# Orkai — Plano de Construção

## Contexto

`plans/1st plan/plan.md` descreve a visão do **Orkai**: um workspace visual open-source, Windows-first, onde humanos supervisionam e agentes de IA executam. Tudo é nó, tudo é conectável, tudo é local-first.

O repositório está **vazio** (só `README.md` de 42 bytes e o commit inicial). Não há código, toolchain Rust não está instalado (só Node v22.23.1 / npm 10.9.8). Portanto este é um plano *greenfield* completo: da instalação do toolchain até o roadmap de features.

O documento de visão é um catálogo de ~60 features (Docker, SSH, browser automation, marketplace de plugins, voz, OCR, colaboração P2P…). Construir isso "de uma vez" é garantia de nunca entregar. Este plano converte a visão em **um slice vertical entregável (M1)** mais um roadmap incremental em que cada milestone é utilizável sozinho.

**Resultado pretendido:** ao fim do M1 existe um app instalável no Windows onde o usuário abre um canvas infinito, cria terminais reais (ConPTY, roda Vim/lazygit/Claude Code) e notas markdown, arrasta/conecta, fecha o app e reabre com tudo exatamente onde estava.

---

## Decisões de arquitetura (fixadas)

### 1. Renderização: híbrido DOM + GPU

O spec pede "canvas 100% wgpu, nunca CPU-render" **e** xterm.js + browser embutido. Isso é contraditório: xterm.js e webviews são DOM, não desenham dentro de uma surface wgpu.

**Decisão:** canvas híbrido, o mesmo modelo de Figma/tldraw/Excalidraw.

| Camada | Tecnologia | Conteúdo |
|---|---|---|
| Fundo (GPU) | `<canvas>` WebGL2 | grid, arestas/conexões, seleção em massa, minimapa, highlights |
| Nós (DOM) | `div` absolutos, `transform: translate3d(...) scale(...)` | terminal, markdown, imagem, git, browser |
| Overlay | DOM | handles de resize, menus, guias de alinhamento |

- Composição das camadas de nó é feita pela **GPU do compositor do navegador** (`will-change: transform`), não pela CPU — o requisito real do spec ("nunca CPU-render") é atendido.
- **Virtualização é o que dá escala**, não o renderer: só nós dentro do viewport são montados; fora dele viram placeholders leves (retângulo + título). Terminais fora da tela ficam com o processo ConPTY vivo mas o `xterm.js` desmontado — o buffer vive no Rust.
- `xterm.js` usa o addon `@xterm/addon-webgl` — o terminal em si já é GPU.
- **wgpu nativo em Rust fica fora do M1–M4.** Só entra se o benchmark provar que WebGL2 não segura 1000+ nós (`ponytail:` teto conhecido, upgrade path registrado).

### 2. Estado do canvas mora no Rust, não no React

A fonte da verdade do workspace (nós, posições, conexões, viewport) é o backend Rust + SQLite. O React é uma projeção. Isso evita o clássico "estado duplicado que diverge" e permite que plugins/agentes mutem o workspace sem passar pelo front.

- Front lê via comandos Tauri + assina eventos de mudança.
- Mutações de alta frequência (arrastar um nó a 144fps) são **otimistas no front** e persistidas com *debounce* de ~300ms no Rust.

### 3. Um crate por domínio, sem camadas fantasmas

Clean architecture sim, mas sem `IWorkspaceRepositoryFactory`. Cada crate expõe um trait só quando existe uma segunda implementação real (ex.: `PtyBackend` → ConPTY hoje, SSH/Docker depois — essa é legítima).

### 4. Persistência: SQLite via `sqlx` + arquivos soltos

- `workspace.db` (SQLite): nós, posições, conexões, viewport, preferências, histórico de agentes.
- Conteúdo é **arquivo de verdade** no disco: `.md` é `.md`, imagem é imagem. O DB guarda o *ponteiro* e a posição, não o conteúdo. Local-first de verdade, e Git funciona.
- `libSQL` só se replicação for necessária — não é, no local-first. `sqlx` puro.

---

## Stack

| Área | Escolha | Nota |
|---|---|---|
| Backend | Rust 1.8x, edition 2021 | |
| Shell desktop | Tauri v2 | WebView2 no Windows |
| Async | Tokio (multi-thread) | |
| Front | React 19 + TypeScript 5 + Vite | |
| Estado front | Zustand | leve; Redux é overkill aqui |
| Terminal | `@xterm/xterm` + `addon-webgl` + `addon-fit` | |
| PTY | crate `portable-pty` (ConPTY no Windows) | não reimplementar ConPTY |
| DB | `sqlx` (SQLite, migrations versionadas) | |
| FS watch | `notify` | |
| Serialização | `serde` + `serde_json` | |
| Busca | SQLite FTS5 (via `sqlx`) | M6 trocou `tantivy` por FTS5 — ver a nota do milestone |
| Markdown | `unified`/`remark` no front | render live |
| Erros | `thiserror` (libs) + `anyhow` (app) | |
| Logs | `tracing` + `tracing-subscriber` (JSON em arquivo) | |
| Testes Rust | `cargo test` + `insta` (snapshots) | |
| Testes front | Vitest + Testing Library | |
| E2E | WebDriver (`tauri-driver`) | a partir do M2 |
| CI | GitHub Actions (windows-latest) | |

---

## Estrutura do repositório

```
orkai/
├─ apps/
│  └─ desktop/
│     ├─ src/                  # React + TS
│     │  ├─ canvas/            # viewport, camada WebGL, virtualização
│     │  ├─ nodes/             # um diretório por tipo de nó
│     │  ├─ stores/            # Zustand
│     │  ├─ ipc/               # wrappers tipados dos comandos Tauri
│     │  └─ ui/                # primitivos compartilhados
│     ├─ src-tauri/            # binário Tauri: comandos, eventos, DI
│     ├─ index.html
│     └─ package.json
├─ crates/
│  ├─ orkai-core/              # domínio: Workspace, Node, Connection, Viewport
│  ├─ orkai-storage/           # sqlx, migrations, repositórios
│  ├─ orkai-pty/               # trait PtyBackend + impl ConPTY
│  └─ orkai-ipc/               # tipos compartilhados Rust↔TS (ts-rs)
├─ docs/
│  ├─ adr/                     # Architecture Decision Records
│  └─ architecture.md
├─ .github/workflows/ci.yml
├─ Cargo.toml                  # workspace
└─ README.md
```

`/plugins`, `/sdk`, `/examples`, `/tools` só são criados quando houver o primeiro conteúdo real (M7). Diretório vazio é dívida.

**Tipos compartilhados:** `ts-rs` gera os `.ts` a partir dos structs Rust (`cargo test` regenera). Elimina a classe inteira de bugs de contrato Rust↔TS. Sem duplicação manual de interface.

---

## Roadmap

Cada milestone termina em algo que o usuário consegue usar.

### M0 — Fundação (≈ 3 dias)
- Instalar Rust (`rustup`, MSVC toolchain) + WebView2 + Visual Studio Build Tools.
- `cargo` workspace, `pnpm`/`npm` workspace, Tauri v2 scaffold, Vite React-TS.
- `rustfmt.toml`, `clippy.toml` (`-D warnings`), ESLint + Prettier, `.editorconfig`.
- CI: build + clippy + test + lint no `windows-latest`.
- ADR-001 (canvas híbrido), ADR-002 (estado no Rust), ADR-003 (SQLite + arquivos).
- **Aceite:** `cargo build && npm run tauri dev` abre uma janela vazia; CI verde.

### M1 — Slice vertical *(o entregável central deste plano)*
Detalhado abaixo.

### M2 — Canvas maduro (≈ 2 semanas)
Seleção múltipla, snap/grid, guias de alinhamento, grupos/frames, undo/redo (command stack no Rust), minimapa, atalhos de teclado, autosave + recuperação de crash.

### M3 — Nós de IA (≈ 3 semanas)
`AgentNode` reutilizando `orkai-pty` (Claude Code, Codex, Aider são CLIs — rodam no mesmo PTY). Perfil de agente (nome, role, cwd, provider, modelo). Histórico persistido. Dashboard de custo por tokens. Notificações nativas do Windows.

### M4 — Grafo e colaboração entre agentes (≈ 3 semanas)
Conexões com semântica (Agent→Agent, Git→Agent). Passagem de contexto entre nós. Modo Maestro (1 orquestrador, N workers). Debugger visual de agente (prompt/resposta/tool call).

### M5 — Paralelismo sem babá *(entregue)*
Trocado com o M6 depois do M4: com dois agentes o app já era usável, com cinco o custo virava vigiar terminal e desatar conflito de arquivo. Busca não resolve nenhum dos dois.

- **Camada de atenção** (`src-tauri/attention.rs`): heurística sobre a saída do PTY classifica cada agente em *trabalhando / precisa de você / ocioso / encerrado*. Detecta no Rust porque o nó virtualizado não tem front escutando — e é justamente o agente fora da tela que precisa avisar. Anel no nó, fila ordenada por urgência no painel, notificação nativa na transição.
- **Worktree git por agente** (`src-tauri/git.rs`): cada agente ganha branch e pasta próprias (`orkai/<slug>`, fora do repositório), com `+N/−M` no painel e integrar/descartar pela UI. A base do diff mora no `git config orkai.base` do worktree — sem campo novo no `NodeKind`, sem migração.
- **`orkai_note`**: quinta tool MCP, escreve numa nota conectada (append por padrão). O artefato do agente deixa de morrer no scrollback e vira nó no canvas, que o humano edita e os vizinhos leem. A nota aberta recarrega via evento `note://changed`.

### M6 — Conhecimento e busca *(entregue)*
Com cinco agentes trabalhando em paralelo (M5), o material que eles produzem passou a sumir: uma nota de três dias atrás só era alcançável se o nó ainda estivesse visível, e o `+42/−7` do worktree não dizia *o que* mudou. O M6 fecha isso — achar pelo teclado, ver o trabalho como arquivo e diff no canvas, reaproveitar prompts.

- **Busca em SQLite FTS5, não tantivy** (`migrations/0004_search.sql`, `src-tauri/indexer.rs`). O corpus é a pasta de um workflow e o SQLite já estava aqui; tantivy custaria uma dependência pesada sobre `lto = true`, um bump do `rust-version` e um segundo estado para divergir do banco. `remove_diacritics 2` no tokenizer é o que faz "sessao" achar "sessão". A entrada do usuário passa por `fts_query`, que escapa os operadores do `MATCH` — fronteira de confiança, não conveniência. Teto: sem fuzzy/typo-tolerance; tantivy segue como upgrade path.
- **Índice reconstruído quando o palette abre**, não por watcher (`notify`): um walk mais uma transação — a primeira do repositório, porque apagar e repovoar são meia operação cada.
- **`Ctrl+K`** (`ui/CommandPalette.tsx`): nós, arquivos, ações e prompts. Nós, ações e prompts são filtrados no front — já estão em memória, e indexá-los seria manter índice para o que um `Array.filter` resolve. Só conteúdo de arquivo vai ao FTS5. O atalho entra antes da guarda `digitando` do `useKeyboard` e o xterm devolve a tecla via `attachCustomKeyEventHandler`: o caso comum é o foco estar num terminal, e é aí que ele mais vale.
- **`GitNode` com diff embutido + `FileTreeNode`**, dois nós em vez de três. Um `DiffNode` separado duplicaria estado de sincronização com o `GitNode`. O `GitNode` não guarda pasta: de qual repositório ele fala sai da conexão — ligado a um agente mostra o worktree dele e habilita integrar/descartar, solto mostra a raiz do workflow. `status_files` une `status --porcelain` e `diff --numstat`, pagando o débito registrado em `git.rs` (arquivo novo não rastreado, que era justamente o trabalho do agente que não aparecia). `NodeKind` novo não pediu migration: `kind_data` é JSON.
- **Biblioteca de prompts** (`stores/promptsStore.ts`): blob JSON em `app_setting`, mesmo contrato das roles. Versionamento é uma pilha de revisões dentro do próprio prompt, com teto de 20 — o histórico inteiro vive numa linha.
- **Fora do corpus:** scrollback dos agentes. Indexar transcript de PTY é ruído com ANSI; entra quando alguém pedir.

### M7 — Plugins (≈ 4 semanas)
SDK TypeScript primeiro (WebView já executa JS — é o caminho mais curto). Manifest + modelo de permissões (fs/rede explícitos). Instalação via URL do GitHub. Rust/Python SDK depois, se houver demanda real.

### M8+ — Backlog priorizado por demanda
Docker, SSH, browser automation, MCP inspector, automações/cron, voz/Whisper/OCR, colaboração P2P, marketplace, Linux/macOS.

> **Nota de escopo:** o documento de visão lista marketplace, voz, OCR, mobile companion e colaboração P2P. Nenhum deles entra antes do M8. São multiplicadores de valor sobre um núcleo que ainda não existe.

---

## M1 — Slice vertical (detalhado)

**Objetivo:** provar a tese inteira do produto com o menor número de features possível. Todo nó futuro é repetição deste padrão.

### Escopo
1. Canvas infinito com pan (espaço+arrastar / botão do meio) e zoom (roda, 10%–400%).
2. `TerminalNode`: PowerShell/cmd real via ConPTY, paridade com Windows Terminal.
3. `MarkdownNode`: edição + preview live, salvando em `.md` no disco.
4. Criação, movimentação, redimensionamento e exclusão de nós.
5. Persistência do workspace em SQLite; restauração completa ao reabrir.

**Fora do M1:** conexões entre nós, undo/redo, grupos, plugins, agentes, busca, minimapa.

### Implementação

**`crates/orkai-core`** — domínio puro, zero I/O.
- `Workspace { id, name, viewport, nodes, connections }`
- `Node { id, kind: NodeKind, position: Vec2, size: Size, z_index, created_at }`
- `NodeKind` enum tagged: `Terminal { cwd, shell }`, `Markdown { file_path }`
- `Viewport { pan: Vec2, zoom: f32 }` — `zoom` validado no construtor (nunca 0/NaN)
- Testes: serialização round-trip, invariantes de `Viewport`.

**`crates/orkai-storage`**
- `migrations/0001_init.sql`: tabelas `workspace`, `node`, `connection`.
- `WorkspaceRepository`: `load()`, `save_node()`, `delete_node()`, `save_viewport()`.
- Escritas em transação. Testes de integração contra SQLite em memória.

**`crates/orkai-pty`**
- `trait PtyBackend { fn spawn(cmd, cwd, cols, rows) -> PtySession; }` — o trait existe porque SSH e Docker exec (M7) são a segunda e terceira implementações reais.
- `ConPtyBackend` sobre `portable-pty`.
- `PtySession`: canal de bytes do PTY → Tauri event; `write()`, `resize()`, `kill()`.
- Buffer circular de scrollback no Rust (últimos N KB) para permitir desmontar o `xterm.js` sem perder histórico ao virtualizar.
- Teste: spawn de `cmd /c echo orkai` e asserção do output.

**`apps/desktop/src-tauri`** — comandos finos, só orquestração:
`workspace_load`, `node_create`, `node_update`, `node_delete`, `viewport_save`, `pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`. Eventos: `pty://data/{id}`, `pty://exit/{id}`, `node://changed`.

**Front — `apps/desktop/src/canvas/`**
- `useViewport()`: pan/zoom, converte tela↔mundo. Uma única matriz de transformação, aplicada com `transform` no container dos nós e como uniform no shader do WebGL.
- `CanvasBackground.tsx`: WebGL2, desenha grid infinito no espaço do mundo. (No M1 desenha só o grid; a mesma camada recebe as arestas no M4.)
- `NodeLayer.tsx`: virtualização — mapeia só os nós cujo bounding box intersecta o viewport expandido em 20%.
- `nodes/TerminalNode.tsx`, `nodes/MarkdownNode.tsx`: registrados num `nodeRegistry` (`Record<NodeKind, ComponentType<NodeProps>>`). Adicionar um tipo novo = uma entrada no registry.
- `stores/workspaceStore.ts` (Zustand): update otimista + `flush` com debounce para o Rust.

**Paridade de terminal — critérios objetivos:** `vim`, `lazygit`, `btop` e `claude` rodam com cores, alternate buffer, resize correto e UTF-8/emoji. Isso vem quase de graça do ConPTY + xterm.js; o que costuma quebrar é o *resize* — `addon-fit` deve disparar `pty_resize` com debounce.

### Testes do M1
- **Rust unit:** invariantes de domínio, serde round-trip, `Viewport::zoom` rejeita valores inválidos.
- **Rust integração:** repositório contra SQLite em memória; ciclo criar→mover→recarregar→posição idêntica; `ConPtyBackend` com comando real.
- **Front unit (Vitest):** matemática de tela↔mundo (a fonte nº1 de bugs em canvas); predicado de virtualização (nó fora do viewport não monta).
- **E2E (`tauri-driver`, 1 cenário):** abrir app → criar terminal → digitar `echo orkai` → ver output → fechar → reabrir → nó na mesma posição.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Resize/ConPTY quebrando TUIs (Vim, btop) | Testar cedo com os 4 binários-alvo; debounce no resize |
| Performance com muitos terminais | Virtualização desde o M1; buffer no Rust, `xterm.js` desmontado fora da tela |
| WebGL2 não segurar 1000+ nós | Benchmark ao fim do M2; wgpu nativo é o upgrade path documentado |
| Divergência de estado Rust↔React | `ts-rs` gera os tipos; Rust é a fonte da verdade |
| Escopo do documento de visão | Roadmap por milestone; nada do M8+ antes do núcleo |
| OneDrive no path do projeto | Sincronização pode travar `target/` — configurar exclusão ou mover o repo |

---

## Verificação

**M0:** `cargo clippy -- -D warnings`, `cargo test`, `npm run lint`, `npm run tauri dev` abre janela. CI verde.

**M1, manual end-to-end:**
```
npm run tauri dev
```
1. Criar `TerminalNode` → rodar `vim`, `lazygit`, `btop`, `claude`; redimensionar o nó e confirmar reflow do TUI.
2. Criar `MarkdownNode` → editar → confirmar o `.md` no disco com o conteúdo correto.
3. Pan/zoom com ~50 nós; verificar 60fps no Performance do DevTools.
4. Fechar e reabrir → posições, viewport, zoom e conteúdo restaurados.

**M1, automatizado:**
```
cargo test --workspace
npm run test
npm run test:e2e
```

**Benchmark (fim do M2):** cena sintética com 1000 nós; medir FPS de pan/zoom e tempo de montagem. Define se wgpu nativo é necessário.
