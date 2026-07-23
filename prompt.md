# Prompt — Landing page do Orkai

Cole o bloco abaixo em uma IA geradora de sites (Lovable, v0, Claude, etc.).
Ele já pede o botão de download ligado ao instalador real do Orkai.

---

## Prompt

Crie uma **landing page** de página única para o **Orkai**, um produto de software.
Responda em português (pt-BR) e entregue código pronto para produção.

### Sobre o produto (use como fonte da verdade do conteúdo)

Orkai é um **workspace visual open-source, Windows-first, para orquestração de agentes
de IA**. É um **canvas infinito** onde terminais, notas e agentes de CLI são **nós
conectáveis**. A ideia central e diferencial: **a conexão entre dois nós é a permissão**
— um agente só vê e só conversa com quem tem uma aresta ligada a ele (uma ACL visual).
Tem modo **Maestro** (um orquestrador comandando vários workers), **debugger visual**
das chamadas entre agentes, e **workflows** por pasta de projeto na sidebar. Tema
claro/escuro. É um app desktop nativo (leve, feito em Rust + Tauri), não um site.

### Estrutura da página

1. **Hero**: nome "Orkai", uma headline forte sobre orquestrar agentes de IA num canvas
   visual, um subtítulo de 1–2 linhas, e **dois botões**: o primário **"Baixar para
   Windows"** (download, ver seção abaixo) e um secundário **"Ver no GitHub"**
   (link `https://github.com/orkai/orkai`).
2. **Como funciona / features** (3 a 6 cartões): Canvas infinito de nós conectáveis;
   A aresta é a ACL (segurança visual); Modo Maestro; Debugger visual de MCP; Workflows
   por projeto; Terminais e agentes de CLI como nós.
3. **Requisitos**: Windows 10/11 com WebView2. Deixe claro que é **Windows-first**.
4. **Faixa de CTA final** repetindo o botão de download.
5. **Rodapé**: link do GitHub, licença **MIT**, "open-source".

### Botão de download (requisito obrigatório — precisa funcionar)

O usuário deve conseguir **baixar o instalador do Orkai direto pela landing page**.
O instalador é publicado como asset do **GitHub Releases** do repositório
`orkai/orkai` (bundle Tauri: arquivo `.msi` para Windows).

- O botão primário aponta para o instalador mais recente. Use o atalho estável do
  GitHub para o release mais novo:
  `https://github.com/orkai/orkai/releases/latest/download/Orkai_x64_en-US.msi`
- Adicione um **fallback em JavaScript** que, ao carregar a página, consulta
  `https://api.github.com/repos/orkai/orkai/releases/latest`, encontra o asset que
  termina em `.msi` e usa a `browser_download_url` dele no botão (assim o link se
  mantém correto mesmo se o nome do arquivo mudar). Se a chamada falhar, mantenha o
  link estático acima.
- Se não houver release publicado ainda, o botão deve continuar visível e apontar para
  `https://github.com/orkai/orkai/releases` (não deixe o botão quebrado).
- Mostre um texto pequeno abaixo do botão: "Windows 10/11 · instalador .msi".

### Estilo e técnica

- Visual **dark por padrão**, moderno e técnico (público desenvolvedor): fundo escuro,
  destaque em uma cor de acento, tipografia limpa, cantos suaves. Evite clichê de
  gradiente exagerado; mire em algo sóbrio como ferramenta de dev.
- Sugira visualmente o **canvas de nós conectados** no hero (nós ligados por curvas).
- **Responsivo** (desktop e mobile), acessível (contraste, `alt`, foco visível).
- Entregue **HTML + CSS (e JS mínimo) autocontido**, sem dependências externas de CDN
  quando possível. Sem framework pesado — é uma landing estática.
- Otimizada para carregar rápido; nada de imagens gigantes.

Entregue o código completo da página pronto para publicar.
