# Orkai — Plano do M3

## Contexto

M1 entregou o slice vertical (canvas + terminal ConPTY + nota + persistência). M2 amadureceu o canvas (conexões, seleção múltipla, snap/guias, undo/redo, minimapa, frames). O produto ainda é "canvas com terminais": não tem nada de IA.

M3 introduz o **`AgentNode`** — o nó que roda um agente de IA de CLI (Claude Code, Codex, Aider) dentro do workspace. É o milestone que entrega a promessa central do Orkai.

**Por que agora é barato:** um agente de CLI é um processo num PTY, e o `orkai-pty` já faz isso com paridade de Windows Terminal. Um `AgentNode` é um `TerminalNode` que (a) nasce rodando `claude` em vez do shell e (b) carrega um perfil em vez de só `cwd`+`shell`. O grosso é reuso.

**Resultado pretendido:** o usuário clica "+ Agente", escolhe um perfil (ex.: Claude / Architect), e um nó abre já rodando `claude` na pasta do projeto. Fecha e reabre o app: a conversa do agente continua visível (histórico persistido), não só a posição do nó.

**Fora do M3 (é M4):** comunicação entre agentes — o "claude vê o claude" via servidor MCP + a aresta como ACL. O `AgentNode` precisa existir e ser sólido sozinho antes de construir a ponte entre eles.

---

## Escopo do M3

### Fatia mínima entregável (M3a) — o núcleo
1. `NodeKind::Agent` com perfil (nome, role, provider, comando, cwd, prompt de sistema).
2. `AgentNode` no front: mesmo terminal do `TerminalNode`, mas rodando o CLI do agente.
3. Catálogo de perfis: Claude, Codex, Aider × roles do documento de visão.
4. Diálogo "+ Agente" para escolher perfil e pasta.
5. Histórico persistido: o scrollback da sessão sobrevive ao restart.

### Incrementos (M3b) — depois do núcleo provado
6. Dashboard de custo (tokens por agente/dia).
7. Notificações nativas do Windows ("agente terminou").

Ordem proposital: 1–5 provam a tese; 6–7 são valor sobre um núcleo que já funciona.

---

## Implementação

### 1. Domínio — `NodeKind::Agent`

`crates/orkai-core/src/node.rs`: nova variante, exatamente o padrão do `Frame`.

```rust
Agent {
    name: String,
    role: String,           // "Architect", "Reviewer"… — string livre, não enum
    command: String,        // "claude", "codex", "aider"
    args: Vec<String>,      // flags do CLI
    cwd: PathBuf,
    system_prompt: String,  // injetado via arquivo/flag conforme o CLI
}
```

- `tag()` retorna `"agent"`.
- **`role` é `String`, não enum:** o catálogo de roles é dado de configuração (perfis), não invariante de domínio. Enum forçaria migração a cada role nova e travaria roles customizadas — que o documento de visão pede.
- Teste: round-trip serde, `tag()` bate com a serialização (estender o teste que já cobre os outros kinds).

### 2. PTY — spawn com comando arbitrário

O `PtySpec` já aceita `shell` + `args` + `cwd` (`session.rs:10`). Um agente é só `PtySpec::new("claude", cwd).with_args(...)`. **Nenhuma mudança no `orkai-pty` para o spawn.**

`pty_spawn` (`commands.rs:198`) hoje casa só `NodeKind::Terminal`. Estender para derivar `PtySpec` de ambos:

```rust
let spec = match &node.kind {
    NodeKind::Terminal { cwd, shell } => /* como hoje */,
    NodeKind::Agent { command, args, cwd, .. } => PtySpec::new(command, cwd).with_args(args.clone()),
    _ => return Err(AppError::NotSpawnable(node_id.to_string())),
};
```

- `system_prompt` entra conforme o CLI: Claude Code lê `CLAUDE.md` do cwd; o comando pode receber `--append-system-prompt`. Detalhe por-provider, com `ponytail:` marcando "Claude primeiro".
- Renomear `AppError::NotATerminal` → `NotSpawnable`.

### 3. Persistência do histórico

Hoje o `Scrollback` vive só em RAM (`scrollback.rs`). Para sobreviver ao restart:

- Nova migration `0002_agent_history.sql`: tabela `agent_output(node_id, seq, chunk, created_at)` — append-only, blocos base64/blob na ordem de chegada.
- No `pty_spawn`, além de empurrar no `Scrollback`, gravar o bloco (append) com **debounce/lote** — uma escrita por bloco de terminal afogaria o SQLite; agregar ~200ms.
- Novo comando `agent_history(node_id)` que devolve o output persistido; o `AgentNode` carrega dele na montagem, como já faz com `pty_scrollback`.
- Ao deletar o nó, `ON DELETE CASCADE` limpa o histórico (mesmo padrão das conexões).
- **`ponytail:` teto:** guardar bytes crus do terminal (com escapes ANSI). Parsing semântico da conversa fica para quando/se o debugger visual (M4) precisar.

### 4. Front — `AgentNode` e catálogo

- `nodes/AgentNode.tsx`: reusa a lógica do `TerminalNode` (o mesmo xterm.js + ConPTY). Diferença é cosmética (cor por role, cabeçalho com nome/role) e a fonte do histórico (`agent_history` em vez de `pty_scrollback`). **Extrair o núcleo do terminal num hook `usePtySession` compartilhado** para não duplicar — hoje o `TerminalNode` tem ~120 linhas que os dois compartilhariam.
- `agents/profiles.ts`: catálogo estático de perfis (Claude/Codex/Aider × roles), com o comando e args de cada um.
- `ui/AgentDialog.tsx`: escolher perfil + pasta (via `@tauri-apps/plugin-dialog` para o picker de diretório) e chamar `createNode`.
- Registrar `agent` no `nodeRegistry` e no `DEFAULT_NODE_SIZE`.
- Botão "+ Agente" na `Toolbar`.

### 5. Incrementos M3b

- **Custo:** parser por-provider do output do CLI (cada um reporta tokens diferente; alguns não reportam). `ponytail:` só Claude + Codex no começo. Painel lê de uma tabela `agent_cost` agregada.
- **Notificações:** `tauri-plugin-notification` (pronto). Disparar no `PtyEvent::Exit` de um `AgentNode`.

---

## Arquivos

| Arquivo | Mudança |
|---|---|
| `crates/orkai-core/src/node.rs` | `NodeKind::Agent` + `tag()` + teste |
| `crates/orkai-pty/src/session.rs` | nenhuma — `PtySpec` já basta |
| `crates/orkai-storage/migrations/0002_agent_history.sql` | tabela append-only de output |
| `crates/orkai-storage/src/repository.rs` | `append_output`, `load_output`, cascade |
| `src-tauri/src/commands.rs` | `pty_spawn` deriva spec do Agent; `agent_history` |
| `src-tauri/src/error.rs` | `NotATerminal` → `NotSpawnable` |
| `apps/desktop/src/nodes/usePtySession.ts` (novo) | núcleo do terminal, compartilhado |
| `apps/desktop/src/nodes/AgentNode.tsx` (novo) | agente sobre o hook |
| `apps/desktop/src/nodes/TerminalNode.tsx` | passa a usar o hook |
| `apps/desktop/src/agents/profiles.ts` (novo) | catálogo de perfis |
| `apps/desktop/src/ui/AgentDialog.tsx` (novo) | seletor de perfil + pasta |
| `registry.tsx`, `workspaceStore.ts`, `Toolbar.tsx`, `types.ts` | registrar o tipo `agent` |

---

## Testes

- **Rust unit:** round-trip de `NodeKind::Agent`; `tag()` == serialização.
- **Rust integração:** `append_output` + `load_output` fazem round-trip; histórico some no delete do nó (cascade); ordem dos blocos preservada por `seq`.
- **Front unit:** catálogo de perfis produz `command`/`args` corretos por (provider, role); o hook `usePtySession` decodifica base64 igual hoje (herda os testes do base64).
- **E2E (`#[ignore]`, sob demanda — custa tokens):** criar `AgentNode` rodando `claude`, mandar um prompt trivial, ver a resposta chegar no output; fechar e reabrir o app e confirmar que a resposta ainda está lá.

---

## Riscos

| Risco | Mitigação |
|---|---|
| `claude`/`codex`/`aider` não estarem no PATH do usuário | detectar na criação (como `default_shell` faz com `pwsh`); avisar no diálogo se ausente |
| Histórico grande estourar o SQLite ao longo de dias | tabela append-only com poda por idade/tamanho no load; `ponytail:` poda simples primeiro |
| `system_prompt` injetado diferente por CLI | começar só com Claude Code; marcar o teto |
| Custo de tokens: cada CLI reporta diferente, alguns não | M3b, parser por-provider, Claude+Codex primeiro |
| Duplicação Terminal/Agent | extrair `usePtySession` antes de escrever o `AgentNode` |

---

## Verificação

```powershell
cargo test --workspace
npm run lint && npm run typecheck && npm test
npm run tauri dev
```

Manual: "+ Agente" → Claude/Architect na pasta de um projeto → o nó abre rodando `claude`, aceita prompt, responde. Fechar e reabrir → a conversa continua na tela. Conectar dois agentes com uma aresta ainda não faz nada além de desenhar a linha — isso é M4.
