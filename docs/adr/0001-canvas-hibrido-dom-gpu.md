# ADR-001 — Canvas híbrido DOM + GPU

**Status:** aceito · 2026-07-23

## Contexto

O documento de visão exige simultaneamente:

- canvas 100% acelerado por GPU via `wgpu`, "nunca CPU-render";
- nós de terminal com `xterm.js` e nós de browser com Chromium embutido.

Os dois requisitos são incompatíveis: `xterm.js` e webviews são DOM e não desenham dentro de uma surface `wgpu`. Implementar tudo em `wgpu` exigiria emulador VT próprio, atlas de glifos e um motor de layout — meses antes do primeiro terminal funcionar.

## Decisão

Canvas híbrido, o modelo de Figma, tldraw e Excalidraw:

| Camada | Tecnologia | Conteúdo |
|---|---|---|
| Fundo | `<canvas>` WebGL2 | grid infinito |
| Arestas | `<canvas>` 2D | conexões (bezier), guias de alinhamento |
| Nós | `div` absolutos com `translate3d` | terminal, markdown, frame, browser, git |
| Overlay | DOM | marquise de seleção, minimapa, handles, menus |

**Emenda (M2):** as arestas ficaram em Canvas2D, não no WebGL como planejado. Bezier em WebGL exige quads instanciados com SDF ou tesselação — trabalho desproporcional para algumas centenas de curvas cuja rasterização não aparece no perfil. A camada continua sendo composta pela GPU. Teto registrado em `EdgeLayer.tsx`; se o benchmark de 1000 nós acusar, elas migram para a camada do grid.

Uma única matriz de transformação (`apps/desktop/src/canvas/viewport.ts`) alimenta as duas camadas.

## Consequências

- `xterm.js` roda de verdade, com `@xterm/addon-webgl` — o terminal já é GPU.
- A composição dos nós é feita pelo compositor do navegador, não pela CPU. O requisito real ("nunca CPU-render") é atendido.
- **A escala vem da virtualização, não do renderer:** só nós que intersectam o viewport são montados (`canvas/virtualization.ts`). O processo ConPTY continua vivo com o `xterm.js` desmontado; o scrollback vive no Rust.
- **Teto conhecido:** WebGL2 + DOM. Se o benchmark de 1000 nós ao fim do M2 não segurar 60fps, o upgrade path é mover a camada de fundo para `wgpu` nativo — os nós DOM continuam iguais.
