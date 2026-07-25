<div align="center">

<img src="apps/desktop/src-tauri/icons/icon.svg" alt="Orkai" width="128" height="128">

# Orkai

**Open-source visual workspace for AI agent orchestration.**

An infinite canvas where terminals, notes, and CLI agents are nodes you can connect.
The edge is not decoration — it is the permission.

<a href="https://github.com/lucasmarujo/orkai/releases/latest">
  <img src="https://img.shields.io/badge/Baixar%20para%20Windows-.msi-4fd6c9?style=for-the-badge&logo=windows&logoColor=0a0b0d&labelColor=15181e" alt="Download Orkai for Windows">
</a>

<br>
<br>

[![Licença: MIT](https://img.shields.io/badge/Licen%C3%A7a-MIT-4fd6c9?style=flat-square&labelColor=15181e)](LICENSE.md)
[![Plataforma](https://img.shields.io/badge/Windows-10%20%7C%2011-4fd6c9?style=flat-square&labelColor=15181e)](#requisitos)
[![Tauri](https://img.shields.io/badge/Tauri-2-4fd6c9?style=flat-square&labelColor=15181e)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-MSVC-4fd6c9?style=flat-square&labelColor=15181e)](https://rustup.rs)
[![React](https://img.shields.io/badge/React-19-4fd6c9?style=flat-square&labelColor=15181e)](https://react.dev)

</div>

---

## What is it

Agent tools today hide who talks to whom behind config files. Orkai
puts it on the screen: each agent, terminal, or note is a node, and the
connection you draw is the channel through which they communicate.

**The edge on the canvas is the ACL.** An agent only reads and communicates with nodes
connected to it. There are no implicit permissions — if there is no wire, there is no
access.

### Highlights

| | |
|---|---|
| **Infinite canvas** | Terminals, notes, and agents as draggable nodes. Zoom, marquee selection, groups, and alignment snapping. |
| **Embedded MCP server** | Each agent gets tools to list peers, exchange messages, read the inbox, and view a neighbor's terminal. |
| **Maestro mode** | Connects an orchestrator to multiple workers and lets you watch delegation happen. |
| **Visual MCP debugger** | Every call between agents appears on screen — you can see the conversation, not just the result. |
| **Project workflows** | Each workflow points to a folder. Switch context without killing processes that are already running. |
| **Real terminals** | Native ConPTY, not emulation. `xterm.js` with WebGL renderer. |

Current state: **M4 — agent collaboration**, built on top of M3 (CLI agents as nodes).

## Installation

Download the latest installer from the
**[releases page](https://github.com/lucasmarujo/orkai/releases/latest)**:

| File | When to use |
|---|---|
| `Orkai_x.y.z_x64_en-US.msi` | Standard installation, for the entire machine. Requires admin. |
| `Orkai_x.y.z_x64-setup.exe` | NSIS installer, per-user. Does not require admin. |

The binary is not signed, so SmartScreen will warn on the first launch —
**More info → Run anyway**.

## Requirements

For **usage**, Windows 10/11 with WebView2 is enough (already included with Windows 11).

For **building**:

- [Rust](https://rustup.rs) with MSVC toolchain
- Visual Studio Build Tools 2022, workload **Desktop development with C++**
- Node.js 22+

## Running from source

```powershell
git clone https://github.com/lucasmarujo/orkai.git
cd orkai
npm install
npm run tauri dev

To generate installers:

```powershell
npm run tauri build
```

The bundles are generated in `target/release/bundle/` (`msi/` and `nsis/`). The first build
compiles all Rust dependencies and takes 10-15 minutes; following builds are much faster.

## Shortcuts

| Action              | How                                                   |
| ------------------- | ----------------------------------------------------- |
| Move canvas         | Drag the background, or use the middle mouse button   |
| Zoom                | Mouse wheel (keeps the point under the cursor fixed)  |
| Select multiple     | Shift + drag (marquee); Ctrl + drag adds to selection |
| Toggle a node       | Shift/Ctrl + click                                    |
| Clear selection     | Click the background, or Esc                          |
| Connect nodes       | Drag the dot on the right edge to another node        |
| Remove connection   | Click the curve                                       |
| Disable snapping    | Hold Alt while dragging                               |
| Undo / Redo         | Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y)                     |
| Select all          | Ctrl+A                                                |
| Delete selection    | Delete                                                |
| Zoom 100% / Fit all | Ctrl+0 / Ctrl+1                                       |

Dragging a **group** moves everything fully contained inside it.

## Verification

```powershell
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm test            # vitest

npm run build       # required before cargo: generate_context! reads the dist/
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

## Structure

```
apps/desktop/          React + TypeScript and the Tauri binary (src-tauri/)
crates/orkai-core/     Domain: Workspace, Node, Connection, Viewport, UndoStack (no I/O)
crates/orkai-storage/  SQLite via sqlx, migrations, repository
crates/orkai-pty/      PtyBackend + ConPTY implementation
landing-page/          Marketing website (React + Vite, deployed via Docker + Caddy)
docs/adr/              Architecture decisions
plans/                 Vision and development plan
```

The Cargo `target/` directory is redirected outside OneDrive through `.cargo/config.toml`
— synchronization blocks compilation.

## Architecture decisions

* [ADR-001 — Hybrid DOM + GPU Canvas](docs/adr/0001-canvas-hibrido-dom-gpu.md)
* [ADR-002 — Source of truth in Rust](docs/adr/0002-estado-no-rust.md)
* [ADR-003 — SQLite for structure, disk for content](docs/adr/0003-sqlite-mais-arquivos.md)

## Contributing

Issues and pull requests are welcome. Before opening a PR, run the
[verification](#verification) block — CI runs exactly these commands and fails on clippy
warnings.

To release a new version, see [RELEASING.md](RELEASING.md).

## License

[MIT](LICENSE.md) © 2026 [Lucas Marujo Amadeu](https://github.com/lucasmarujo)

```
```
