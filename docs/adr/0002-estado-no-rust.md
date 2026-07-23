# ADR-002 — Fonte da verdade no Rust, React como projeção

**Status:** aceito · 2026-07-23

## Contexto

O workspace precisa sobreviver a reinícios e, no M3+, ser mutado por agentes e plugins — não só pela UI. Manter o estado autoritativo no React levaria a duas cópias divergentes assim que algo fora do WebView mexesse nos nós.

## Decisão

`crates/orkai-core` + SQLite são a fonte da verdade. O React é uma projeção:

- leitura via comandos Tauri (`apps/desktop/src/ipc/commands.ts`);
- mutações de alta frequência (arrastar, zoom) são **otimistas** no store Zustand e persistidas com debounce de 300ms (`stores/workspaceStore.ts`);
- falha de persistência reverte o estado local e expõe o erro.

## Consequências

- Agentes e plugins vão poder mutar o workspace sem passar pelo front.
- Arrastar a 144fps não gera uma escrita SQLite por frame.
- Contrato Rust↔TS é duplicado à mão em `src/ipc/types.ts` enquanto são poucos tipos; o teste `kind_serializa_com_tag_discriminante` (`crates/orkai-core/src/node.rs`) trava o formato do lado do Rust. Trocar por geração via `ts-rs` quando passar de ~10 tipos.
