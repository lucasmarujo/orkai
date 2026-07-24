import { useEffect, useState } from 'react'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ACCENT = 'oklch(0.82 0.13 195)'

// Turn a plain CSS string into a React style object so the markup below
// can be edited with familiar `prop: value;` syntax.
function s(css) {
  const out = {}
  css.split(';').forEach((decl) => {
    const i = decl.indexOf(':')
    if (i < 0) return
    let key = decl.slice(0, i).trim()
    const value = decl.slice(i + 1).trim()
    if (!key) return
    key = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    out[key] = value
  })
  return out
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function Icon({ name, size = 18 }) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    'aria-hidden': true,
  }
  switch (name) {
    case 'canvas':
      return (
        <svg {...p}>
          <circle cx="6" cy="6" r="2.4" />
          <circle cx="18" cy="6" r="2.4" />
          <circle cx="12" cy="18" r="2.4" />
          <path d="M8 7.5 11 16M16 7.5 13 16" />
        </svg>
      )
    case 'lock':
      return (
        <svg {...p}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      )
    case 'maestro':
      return (
        <svg {...p}>
          <circle cx="12" cy="5" r="2.2" />
          <circle cx="5" cy="18" r="2.2" />
          <circle cx="19" cy="18" r="2.2" />
          <path d="M12 7v4M12 11 6 16M12 11l6 5" />
        </svg>
      )
    case 'debug':
      return (
        <svg {...p}>
          <path d="m6 9 4 3-4 3" />
          <path d="M13 15h5" />
          <rect x="3" y="4" width="18" height="16" rx="2" />
        </svg>
      )
    case 'workflow':
      return (
        <svg {...p}>
          <path d="M4 6h6M4 12h10M4 18h6" />
          <circle cx="17" cy="6" r="2" />
          <circle cx="19" cy="18" r="2" />
        </svg>
      )
    case 'terminal':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="m7 9 3 3-3 3M13 15h4" />
        </svg>
      )
    case 'codex':
      return (
        <svg {...p}>
          <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'code':
      return (
        <svg {...p}>
          <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
        </svg>
      )
    case 'download':
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" />
          <path d="m7 11 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      )
    case 'github':
      return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
        </svg>
      )
    case 'logo':
      return (
        <svg width="32" height="32" viewBox="0 0 512 512" fill="none" aria-hidden="true">
          <rect x="16" y="16" width="480" height="480" rx="120" fill="#101319" stroke="#2a2e36" strokeWidth="8" />
          <g stroke={ACCENT} strokeWidth="26" strokeLinecap="round">
            <path d="M180 180 L256 256" />
            <path d="M332 180 L256 256" />
            <path d="M256 256 L256 352" />
          </g>
          <g>
            <circle cx="180" cy="180" r="30" fill="#101319" stroke={ACCENT} strokeWidth="22" />
            <circle cx="332" cy="180" r="30" fill="#101319" stroke={ACCENT} strokeWidth="22" />
            <circle cx="256" cy="352" r="30" fill="#101319" stroke={ACCENT} strokeWidth="22" />
            <circle cx="256" cy="256" r="44" fill={ACCENT} />
          </g>
        </svg>
      )
    default:
      return null
  }
}

/* ------------------------------------------------------------------ */
/*  Content data                                                       */
/* ------------------------------------------------------------------ */

const REPO = 'lucasmarujo/orkai'
const GITHUB_URL = `https://github.com/${REPO}`
const RELEASES_URL = `${GITHUB_URL}/releases`
// O nome do .msi embute a versao (Orkai_0.1.0_x64_en-US.msi), entao nao ha link
// estatico estavel para o instalador; o fallback leva para a lista de releases.
const STATIC_MSI = `${RELEASES_URL}/latest`

const FEATURES = [
  { icon: 'canvas', title: 'Infinite node canvas', body: 'Terminals, notes and CLI agents are draggable nodes on an endless canvas. Wire them together to compose real workflows.' },
  { icon: 'lock', title: 'The edge is the ACL', body: 'Security you can see. An agent only reads from and talks to the nodes an edge connects to it. Permissions become visible wiring.' },
  { icon: 'maestro', title: 'Maestro mode', body: 'Promote one node to conductor. Maestro commands a fleet of workers, delegating tasks and merging results across the graph.' },
  { icon: 'debug', title: 'Visual MCP debugger', body: 'Watch calls travel between agents live. Inspect every request and response flowing along each connection in real time.' },
  { icon: 'workflow', title: 'Per-project workflows', body: 'The sidebar organizes canvases by project folder, so each codebase keeps its own agents, layout and context.' },
  { icon: 'terminal', title: 'Terminals as nodes', body: 'Drop native terminals and CLI agents straight onto the canvas as first-class citizens, connectable like everything else.' },
]

const AGENTS = [
  {
    name: 'Claude Code',
    icon: 'terminal',
    body: "Run Anthropic's coding CLI as a node and wire it to the files and workers it should reach.",
    iconColor: '#e08a6e',
    border: '#d9775766',
    iconBorder: '#d9775755',
    iconBg: '#d9775718',
    bg: 'linear-gradient(180deg,#1a1512,#0f1116)',
  },
  {
    name: 'Codex',
    icon: 'codex',
    body: "Plug OpenAI's Codex CLI into your graph and orchestrate it alongside every other agent.",
    iconColor: '#2bbf9b',
    border: '#10a37f66',
    iconBorder: '#10a37f55',
    iconBg: '#10a37f18',
    bg: 'linear-gradient(180deg,#0c1a16,#0f1116)',
  },
  {
    name: 'OpenCode',
    icon: 'code',
    body: 'The open-source CLI agent runs as a first-class node, ready to connect and command.',
    iconColor: '#f0ab3d',
    border: '#f59e0b66',
    iconBorder: '#f59e0b55',
    iconBg: '#f59e0b18',
    bg: 'linear-gradient(180deg,#1a1508,#0f1116)',
  },
]

const STEPS = [
  { n: '01', title: 'Drop your nodes', body: 'Add terminals, notes and CLI agents onto the canvas from the project sidebar.' },
  { n: '02', title: 'Wire the edges', body: 'Connect nodes to grant access. Every edge you draw is a permission an agent can use.' },
  { n: '03', title: 'Promote a Maestro', body: 'Pick a conductor node to delegate work across the connected workers on your graph.' },
  { n: '04', title: 'Watch it run', body: 'Follow every call along its edge in the visual debugger and refine the wiring live.' },
]

const STATS = [
  { v: 'MIT', label: 'Permissive license', color: '#e6e8eb' },
  { v: 'Rust', label: '+ Tauri core', color: '#e6e8eb' },
  { v: '~40MB', label: 'Installer size', color: '#e6e8eb' },
  { v: '100%', label: 'Local-first', color: ACCENT },
]

const REQUIREMENTS = [
  { text: 'Windows 10 or 11 (64-bit)' },
  { text: 'Microsoft Edge WebView2 runtime' },
  { text: '~40\u00A0MB installer, light on memory' },
  { text: 'Light & dark themes included', muted: true },
]

/* ------------------------------------------------------------------ */
/*  Reusable pieces                                                    */
/* ------------------------------------------------------------------ */

function DownloadButton({ href, big }) {
  const pad = big ? '15px 28px' : '14px 24px'
  return (
    <a
      className="btn-primary"
      href={href}
      style={s(
        `display:inline-flex; align-items:center; gap:10px; background:${ACCENT}; color:#06231f; font-weight:600; font-size:15px; padding:${pad}; border-radius:11px; transition:transform 0.15s, box-shadow 0.15s; box-shadow:0 6px 24px oklch(0.82 0.13 195 / 0.25);`
      )}
    >
      <Icon name="download" />
      Download for Windows
    </a>
  )
}

function InstallerNote() {
  return (
    <p style={s("font-family:'IBM Plex Mono',monospace; font-size:12.5px; color:#6b7280; margin:14px 0 0;")}>
      Windows 10/11 · .msi installer
    </p>
  )
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

function Header() {
  return (
    <header style={s('max-width:1180px; margin:0 auto; padding:22px 24px; display:flex; align-items:center; justify-content:space-between;')}>
      <div style={s('display:flex; align-items:center; gap:11px;')}>
        <div style={s('width:32px; height:32px; display:flex; align-items:center; justify-content:center;')}>
          <Icon name="logo" />
        </div>
        <span style={s('font-weight:600; font-size:18px; letter-spacing:-0.01em;')}>Orkai</span>
      </div>
      <nav data-nav style={s('display:flex; align-items:center; gap:26px; font-size:14px;')}>
        <a href="#features" style={s('color:#9aa0a8;')}>Features</a>
        <a href="#agents" style={s('color:#9aa0a8;')}>Agents</a>
        <a href="#requirements" style={s('color:#9aa0a8;')}>Requirements</a>
        <a href={GITHUB_URL} style={s('color:#9aa0a8;')}>GitHub</a>
      </nav>
    </header>
  )
}

function NodeCanvas() {
  return (
    <div style={s('border:1px solid #1c1f26; border-radius:16px; background:linear-gradient(180deg,#0f1116,#0b0d10); padding:18px; position:relative; overflow:hidden;')}>
      <div style={s('position:absolute; inset:0; background-image:radial-gradient(#1a1d24 1px, transparent 1px); background-size:22px 22px; opacity:0.5;')}></div>
      <div style={s("position:relative; display:flex; align-items:center; justify-content:space-between; font-family:'IBM Plex Mono',monospace; font-size:11px; color:#6b7280; margin-bottom:10px;")}>
        <span>workspace.orkai</span>
        <span style={s(`color:${ACCENT};`)}>● maestro</span>
      </div>
      <svg viewBox="0 0 440 340" width="100%" style={{ position: 'relative', display: 'block' }} role="img" aria-label="A visual canvas of connected agent nodes">
        <defs>
          <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.25" />
            <stop offset="1" stopColor={ACCENT} stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="url(#edge)" strokeWidth="1.8" strokeDasharray="5 7" style={{ animation: 'dashflow 1.6s linear infinite' }}>
          <path d="M120 90 C 190 90, 190 170, 250 170" />
          <path d="M120 250 C 190 250, 190 178, 250 178" />
          <path d="M330 174 C 380 174, 380 90, 400 90" />
        </g>
        {/* Maestro */}
        <g>
          <rect x="250" y="150" width="80" height="44" rx="10" fill="#12161c" stroke="oklch(0.82 0.13 195 / 0.6)" />
          <circle cx="264" cy="172" r="4" fill={ACCENT} />
          <text x="278" y="176" fill="#cdd2d8" fontFamily="'IBM Plex Mono',monospace" fontSize="12">Maestro</text>
        </g>
        {/* worker terminal */}
        <g>
          <rect x="46" y="66" width="80" height="46" rx="10" fill="#12161c" stroke="#2a2e36" />
          <circle cx="60" cy="89" r="4" fill="#7dd3c0" />
          <text x="72" y="93" fill="#9aa0a8" fontFamily="'IBM Plex Mono',monospace" fontSize="11">terminal</text>
        </g>
        {/* worker cli */}
        <g>
          <rect x="46" y="228" width="80" height="46" rx="10" fill="#12161c" stroke="#2a2e36" />
          <circle cx="60" cy="251" r="4" fill="#7dd3c0" />
          <text x="72" y="255" fill="#9aa0a8" fontFamily="'IBM Plex Mono',monospace" fontSize="11">cli agent</text>
        </g>
        {/* note (unconnected -> no access) */}
        <g opacity="0.5">
          <rect x="378" y="66" width="48" height="46" rx="10" fill="#101216" stroke="#22252c" strokeDasharray="3 3" />
          <text x="402" y="93" fill="#6b7280" fontFamily="'IBM Plex Mono',monospace" fontSize="10" textAnchor="middle">note</text>
        </g>
      </svg>
      <div style={s("position:relative; margin-top:12px; padding:10px 12px; border:1px solid #1c1f26; border-radius:10px; background:#0c0e12; font-family:'IBM Plex Mono',monospace; font-size:11.5px; color:#7dd3c0; line-height:1.5;")}>
        edge = permission
        <span style={s('color:#6b7280;')}> → agent sees only what connects to it</span>
      </div>
    </div>
  )
}

function Hero({ downloadUrl }) {
  return (
    <section data-grid="hero" style={s('max-width:1180px; margin:0 auto; padding:40px 24px 70px; display:grid; grid-template-columns:1.05fr 1fr; gap:56px; align-items:center;')}>
      <div>
        <div style={s("display:inline-flex; align-items:center; gap:8px; padding:6px 12px; border:1px solid #23262d; border-radius:100px; font-family:'IBM Plex Mono',monospace; font-size:12px; color:#9aa0a8; margin-bottom:26px;")}>
          <span style={s(`width:6px; height:6px; border-radius:50%; background:${ACCENT}; animation:pulse 2s ease-in-out infinite;`)}></span>
          Open-source · Windows-first
        </div>
        <h1 style={s('font-size:56px; line-height:1.04; letter-spacing:-0.03em; font-weight:700; margin:0 0 20px;')}>
          Orchestrate AI agents on an infinite visual canvas.
        </h1>
        <p style={s('font-size:19px; line-height:1.55; color:#9aa0a8; margin:0 0 34px; max-width:520px;')}>
          Terminals, notes, and CLI agents become connectable nodes. The connection{' '}
          <em style={s('color:#e6e8eb; font-style:normal;')}>is</em> the permission. An agent only sees and talks to what an edge links to it.
        </p>
        <div style={s('display:flex; flex-wrap:wrap; gap:14px; align-items:center;')}>
          <DownloadButton href={downloadUrl} />
          <a className="btn-secondary" href={GITHUB_URL} style={s('display:inline-flex; align-items:center; gap:10px; border:1px solid #2a2e36; color:#e6e8eb; font-weight:500; font-size:15px; padding:14px 22px; border-radius:11px; transition:border-color 0.15s, background 0.15s;')}>
            <Icon name="github" />
            View on GitHub
          </a>
        </div>
        <InstallerNote />
      </div>
      <NodeCanvas />
    </section>
  )
}

function Features() {
  return (
    <section id="features" style={s('max-width:1180px; margin:0 auto; padding:30px 24px 20px;')}>
      <p style={s(`font-family:'IBM Plex Mono',monospace; font-size:12.5px; color:${ACCENT}; margin:0 0 10px; letter-spacing:0.02em;`)}>// how it works</p>
      <h2 style={s('font-size:34px; letter-spacing:-0.02em; font-weight:700; margin:0 0 40px; max-width:640px;')}>
        A canvas built for orchestrating agents, not another chat window.
      </h2>
      <div data-grid="features" style={s('display:grid; grid-template-columns:repeat(3,1fr); gap:16px;')}>
        {FEATURES.map((f) => (
          <div key={f.title} className="card-hover" style={s('border:1px solid #1c1f26; border-radius:14px; background:#0f1116; padding:22px; transition:border-color 0.18s, background 0.18s;')}>
            <div style={s(`width:34px; height:34px; border-radius:9px; border:1px solid #262a32; background:#14181e; display:flex; align-items:center; justify-content:center; margin-bottom:16px; color:${ACCENT};`)}>
              <Icon name={f.icon} />
            </div>
            <h3 style={s('font-size:17px; font-weight:600; margin:0 0 8px; letter-spacing:-0.01em;')}>{f.title}</h3>
            <p style={s('font-size:14.5px; line-height:1.55; color:#9aa0a8; margin:0;')}>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Agents() {
  return (
    <section id="agents" style={s('max-width:1180px; margin:0 auto; padding:70px 24px 20px;')}>
      <p style={s(`font-family:'IBM Plex Mono',monospace; font-size:12.5px; color:${ACCENT}; margin:0 0 10px; letter-spacing:0.02em;`)}>// works with your agents</p>
      <h2 style={s('font-size:34px; letter-spacing:-0.02em; font-weight:700; margin:0 0 12px; max-width:640px;')}>
        Bring the coding agents you already use.
      </h2>
      <p style={s('font-size:16px; line-height:1.6; color:#9aa0a8; margin:0 0 40px; max-width:560px;')}>
        Drop any supported CLI agent onto the canvas as a node. More integrations are landing continuously.
      </p>
      <div data-grid="features" style={s('display:grid; grid-template-columns:repeat(3,1fr); gap:16px;')}>
        {AGENTS.map((a) => (
          <div key={a.name} style={s(`border:1px solid ${a.border}; border-radius:14px; background:${a.bg}; padding:22px; display:flex; flex-direction:column; gap:14px;`)}>
            <div style={s('display:flex; align-items:center; justify-content:space-between;')}>
              <div style={s(`width:38px; height:38px; border-radius:10px; border:1px solid ${a.iconBorder}; background:${a.iconBg}; display:flex; align-items:center; justify-content:center; color:${a.iconColor};`)}>
                <Icon name={a.icon} size={19} />
              </div>
              <span style={s("font-family:'IBM Plex Mono',monospace; font-size:11px; color:oklch(0.85 0.14 155); border:1px solid oklch(0.85 0.14 155 / 0.35); border-radius:100px; padding:4px 10px; display:inline-flex; align-items:center; gap:6px;")}>
                <span style={s('width:6px; height:6px; border-radius:50%; background:oklch(0.85 0.14 155);')}></span>
                Available
              </span>
            </div>
            <div>
              <h3 style={s('font-size:17px; font-weight:600; margin:0 0 5px; letter-spacing:-0.01em;')}>{a.name}</h3>
              <p style={s('font-size:14px; line-height:1.55; color:#9aa0a8; margin:0;')}>{a.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div style={s('margin-top:20px; border:1px dashed #262a32; border-radius:14px; background:#0c0e12; padding:20px 24px; display:flex; align-items:center; gap:16px; flex-wrap:wrap;')}>
        <span style={s("font-family:'IBM Plex Mono',monospace; font-size:11px; color:#9aa0a8; border:1px solid #2a2e36; border-radius:100px; padding:4px 10px; display:inline-flex; align-items:center; gap:6px;")}>
          <span style={s('width:6px; height:6px; border-radius:50%; background:#6b7280;')}></span>
          In development
        </span>
        <span style={s('font-size:14.5px; color:#9aa0a8;')}>
          Aider, Gemini CLI, Cline and more integrations are on the way. Bring your own agent by wrapping any command.
        </span>
      </div>
    </section>
  )
}

function Workflow() {
  return (
    <section style={s('max-width:1180px; margin:0 auto; padding:70px 24px 30px;')}>
      <p style={s(`font-family:'IBM Plex Mono',monospace; font-size:12.5px; color:${ACCENT}; margin:0 0 10px; letter-spacing:0.02em;`)}>// from zero to orchestration</p>
      <h2 style={s('font-size:34px; letter-spacing:-0.02em; font-weight:700; margin:0 0 40px; max-width:640px;')}>
        Four steps to a working agent graph.
      </h2>
      <div data-grid="features" style={s('display:grid; grid-template-columns:repeat(4,1fr); gap:16px;')}>
        {STEPS.map((step) => (
          <div key={step.n} style={s('border:1px solid #1c1f26; border-radius:14px; background:#0f1116; padding:22px; position:relative;')}>
            <span style={s(`font-family:'IBM Plex Mono',monospace; font-size:13px; color:${ACCENT}; border:1px solid #23262d; border-radius:8px; padding:3px 9px;`)}>{step.n}</span>
            <h3 style={s('font-size:16.5px; font-weight:600; margin:16px 0 8px; letter-spacing:-0.01em;')}>{step.title}</h3>
            <p style={s('font-size:14px; line-height:1.55; color:#9aa0a8; margin:0;')}>{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function OpenSource() {
  return (
    <section style={s('max-width:1180px; margin:0 auto; padding:40px 24px 10px;')}>
      <div data-grid="req" style={s('border:1px solid #1c1f26; border-radius:16px; background:linear-gradient(180deg,#0f1116,#0b0d10); padding:34px; display:grid; grid-template-columns:1fr 1fr; gap:40px; align-items:center;')}>
        <div>
          <p style={s(`font-family:'IBM Plex Mono',monospace; font-size:12.5px; color:${ACCENT}; margin:0 0 10px;`)}>// open by design</p>
          <h2 style={s('font-size:28px; letter-spacing:-0.02em; font-weight:700; margin:0 0 12px;')}>Yours to inspect, fork and extend.</h2>
          <p style={s('font-size:15px; line-height:1.6; color:#9aa0a8; margin:0 0 22px;')}>
            Orkai is MIT-licensed and fully open-source. Read the code that runs your agents, self-host nothing, and shape the roadmap in the open.
          </p>
          <div style={s('display:flex; gap:12px; flex-wrap:wrap;')}>
            <a className="btn-secondary" href={GITHUB_URL} style={s('display:inline-flex; align-items:center; gap:9px; border:1px solid #2a2e36; color:#e6e8eb; font-weight:500; font-size:14px; padding:11px 18px; border-radius:10px; transition:border-color 0.15s, background 0.15s;')}>
              Star on GitHub
            </a>
            <a className="link-accent" href={GITHUB_URL} style={s('display:inline-flex; align-items:center; gap:9px; color:#9aa0a8; font-weight:500; font-size:14px; padding:11px 4px;')}>
              Read the docs
            </a>
          </div>
        </div>
        <div style={s('display:grid; grid-template-columns:1fr 1fr; gap:14px;')}>
          {STATS.map((stat) => (
            <div key={stat.v} style={s('border:1px solid #1c1f26; border-radius:12px; background:#0c0e12; padding:18px;')}>
              <div style={s(`font-family:'IBM Plex Mono',monospace; font-size:26px; font-weight:500; color:${stat.color};`)}>{stat.v}</div>
              <div style={s('font-size:13px; color:#6b7280; margin-top:4px;')}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Requirements() {
  return (
    <section id="requirements" style={s('max-width:1180px; margin:0 auto; padding:60px 24px;')}>
      <div data-grid="req" style={s('border:1px solid #1c1f26; border-radius:16px; background:linear-gradient(180deg,#0f1116,#0b0d10); padding:34px; display:grid; grid-template-columns:1fr 1fr; gap:40px; align-items:center;')}>
        <div>
          <p style={s(`font-family:'IBM Plex Mono',monospace; font-size:12.5px; color:${ACCENT}; margin:0 0 10px;`)}>// requirements</p>
          <h2 style={s('font-size:28px; letter-spacing:-0.02em; font-weight:700; margin:0 0 12px;')}>Windows-first, natively lightweight.</h2>
          <p style={s('font-size:15px; line-height:1.6; color:#9aa0a8; margin:0;')}>
            Orkai is a native desktop app built with Rust + Tauri, not a web page. It ships as a small{' '}
            <span style={s("font-family:'IBM Plex Mono',monospace; color:#cdd2d8;")}>.msi</span> and runs on the system WebView. Windows is the primary, first-class target.
          </p>
        </div>
        <ul style={s('list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:14px;')}>
          {REQUIREMENTS.map((req) => (
            <li key={req.text} style={s(`display:flex; gap:12px; align-items:flex-start; font-size:15px; color:${req.muted ? '#9aa0a8' : '#e6e8eb'};`)}>
              <span style={s(`color:${req.muted ? '#6b7280' : ACCENT}; font-family:'IBM Plex Mono',monospace;`)}>›</span> {req.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function FinalCTA({ downloadUrl }) {
  return (
    <section style={s('max-width:1180px; margin:0 auto; padding:20px 24px 70px;')}>
      <div style={s('border:1px solid oklch(0.82 0.13 195 / 0.3); border-radius:18px; background:radial-gradient(700px 300px at 50% 0%, oklch(0.82 0.13 195 / 0.1), transparent 70%), #0d0f13; padding:56px 32px; text-align:center;')}>
        <h2 style={s('font-size:34px; letter-spacing:-0.025em; font-weight:700; margin:0 0 14px;')}>Wire up your agents. Ship faster.</h2>
        <p style={s('font-size:17px; color:#9aa0a8; margin:0 auto 30px; max-width:480px; line-height:1.55;')}>
          Free and open-source. Download the installer and open your first canvas in seconds.
        </p>
        <DownloadButton href={downloadUrl} big />
        <InstallerNote />
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={s('border-top:1px solid #16191f;')}>
      <div style={s('max-width:1180px; margin:0 auto; padding:26px 24px; display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between;')}>
        <div style={s('display:flex; align-items:center; gap:10px;')}>
          <div style={s('width:22px; height:22px; border-radius:6px; border:1px solid #2a2e36; background:#0e1013; display:flex; align-items:center; justify-content:center;')}>
            <div style={s(`width:5px; height:5px; border-radius:50%; background:${ACCENT};`)}></div>
          </div>
          <span style={s('font-size:14px; color:#9aa0a8;')}>Orkai · open-source visual agent orchestration</span>
        </div>
        <div style={s("display:flex; align-items:center; gap:22px; font-size:13.5px; color:#6b7280; font-family:'IBM Plex Mono',monospace;")}>
          <a href={GITHUB_URL} style={s('color:#9aa0a8;')}>GitHub</a>
          <span>MIT License</span>
          <span>© 2026</span>
        </div>
      </div>
    </footer>
  )
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const [downloadUrl, setDownloadUrl] = useState(STATIC_MSI)

  useEffect(() => {
    let cancelled = false
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        if (cancelled) return
        const assets = (data && data.assets) || []
        const msi = assets.find((a) => a.name && a.name.toLowerCase().endsWith('.msi'))
        setDownloadUrl(msi ? msi.browser_download_url : STATIC_MSI)
      })
      .catch(() => {
        // If there is no published release yet, keep users on a working page.
        if (!cancelled) setDownloadUrl(STATIC_MSI)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={s('min-height:100vh; background:radial-gradient(1200px 600px at 70% -5%, rgba(79,214,201,0.08), transparent 60%), #0a0b0d;')}>
      <Header />
      <Hero downloadUrl={downloadUrl} />
      <Features />
      <Agents />
      <Workflow />
      <OpenSource />
      <Requirements />
      <FinalCTA downloadUrl={downloadUrl} />
      <Footer />
    </div>
  )
}
