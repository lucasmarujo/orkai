# Orkai — Landing page (React + Vite)

Single-page landing for **Orkai**, the open-source visual AI-agent orchestration workspace.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173).

## Build for production

```bash
npm run build     # outputs to dist/
npm run preview   # serve the built site locally
```

## Project structure

```
index.html            App entry (fonts + favicon)
public/orkai-icon.svg App icon / favicon
src/main.jsx          React bootstrap
src/App.jsx           The whole landing page (all sections + content data)
src/index.css         Global resets, fonts, hover states, responsive rules
```

## Editing the content

Almost everything you'll want to change lives at the top of `src/App.jsx`:

- `FEATURES`, `AGENTS`, `STEPS`, `STATS`, `REQUIREMENTS` — the copy for each section.
- `GITHUB_URL`, `RELEASES_URL`, `STATIC_MSI` — links.
- `ACCENT` — the single accent color used across the page.

Inline styles are written as ordinary CSS strings via the small `s()` helper, so
you can tweak them exactly like a normal `style` attribute.

## Download button

The primary button is a plain link to GitHub's permanent latest-release route:

```
https://github.com/lucasmarujo/orkai/releases/latest/download/Orkai_x64_en-US.msi
```

The release workflow strips the version from the installer file name, so this URL
never has to change. It only resolves once a release is **published** — drafts are
invisible to `/latest/`. See [RELEASING.md](../RELEASING.md).
