import { useRef } from 'react'
import GraphScene from './GraphScene.jsx'
import { spotlight, useActiveStep, usePrefersReducedMotion, useReveal, useScrollFx } from './hooks.js'

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

const ACCENT = 'oklch(0.82 0.13 195)'

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
// O workflow de release renomeia o instalador para um nome sem versao, entao este
// link permanente sempre serve o .msi da ultima release publicada.
const DOWNLOAD_MSI = `${RELEASES_URL}/latest/download/Orkai_x64_en-US.msi`

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
    tone: { '--agent-icon': '#e08a6e', '--agent-line': '#d9775766', '--agent-icon-line': '#d9775755', '--agent-icon-bg': '#d9775718', '--agent-bg': 'linear-gradient(180deg,#1a1512,rgba(15,17,22,0.72))' },
  },
  {
    name: 'Codex',
    icon: 'codex',
    body: "Plug OpenAI's Codex CLI into your graph and orchestrate it alongside every other agent.",
    tone: { '--agent-icon': '#2bbf9b', '--agent-line': '#10a37f66', '--agent-icon-line': '#10a37f55', '--agent-icon-bg': '#10a37f18', '--agent-bg': 'linear-gradient(180deg,#0c1a16,rgba(15,17,22,0.72))' },
  },
  {
    name: 'OpenCode',
    icon: 'code',
    body: 'The open-source CLI agent runs as a first-class node, ready to connect and command.',
    tone: { '--agent-icon': '#f0ab3d', '--agent-line': '#f59e0b66', '--agent-icon-line': '#f59e0b55', '--agent-icon-bg': '#f59e0b18', '--agent-bg': 'linear-gradient(180deg,#1a1508,rgba(15,17,22,0.72))' },
  },
]

const STEPS = [
  { n: '01', title: 'Drop your nodes', body: 'Add terminals, notes and CLI agents onto the canvas from the project sidebar.' },
  { n: '02', title: 'Wire the edges', body: 'Connect nodes to grant access. Every edge you draw is a permission an agent can use.' },
  { n: '03', title: 'Promote a Maestro', body: 'Pick a conductor node to delegate work across the connected workers on your graph.' },
  { n: '04', title: 'Watch it run', body: 'Follow every call along its edge in the visual debugger and refine the wiring live.' },
]

const STATS = [
  { v: 'MIT', label: 'Permissive license' },
  { v: 'Rust', label: '+ Tauri core' },
  { v: '~40MB', label: 'Installer size' },
  { v: '100%', label: 'Local-first', accent: true },
]

const REQUIREMENTS = [
  { text: 'Windows 10 or 11 (64-bit)' },
  { text: 'Microsoft Edge WebView2 runtime' },
  { text: '~40 MB installer, light on memory' },
  { text: 'Light & dark themes included', muted: true },
]

/* ------------------------------------------------------------------ */
/*  Reusable pieces                                                    */
/* ------------------------------------------------------------------ */

function DownloadButton({ href, size }) {
  return (
    <a className={`btn btn--primary${size ? ` btn--${size}` : ''}`} href={href}>
      <Icon name="download" />
      {size === 'sm' ? 'Download' : 'Download for Windows'}
    </a>
  )
}

function InstallerNote() {
  return <p className="installer-note">Windows 10/11 · .msi installer</p>
}

function SectionHead({ eyebrow, title, body }) {
  return (
    <div className="section__head" data-reveal>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {body ? <p className="muted">{body}</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

function Header({ scrolled }) {
  return (
    <header className={`header${scrolled ? ' is-scrolled' : ''}`}>
      <div className="shell header__bar">
        <a className="brand" href="#top">
          <Icon name="logo" />
          Orkai
        </a>
        <nav className="nav">
          <a href="#features">Features</a>
          <a href="#agents">Agents</a>
          <a href="#workflow">How it works</a>
          <a href="#requirements">Requirements</a>
        </nav>
        <div className="header__actions">
          <a className="btn btn--ghost btn--sm" href={GITHUB_URL}>
            <Icon name="github" />
            GitHub
          </a>
          <DownloadButton href={DOWNLOAD_MSI} size="sm" />
        </div>
      </div>
      <div className="progress" aria-hidden="true" />
    </header>
  )
}

function CanvasPreview() {
  return (
    <div className="panel preview" data-reveal style={{ '--i': 2 }}>
      <div className="preview__bar">
        <span>workspace.orkai</span>
        <b>● maestro</b>
      </div>
      <svg className="preview__svg" viewBox="0 0 440 340" role="img" aria-label="A visual canvas of connected agent nodes">
        <defs>
          <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.25" />
            <stop offset="1" stopColor={ACCENT} stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <g className="edges" fill="none" stroke="url(#edge)" strokeWidth="1.8" strokeDasharray="5 7">
          <path d="M120 90 C 190 90, 190 170, 250 170" />
          <path d="M120 250 C 190 250, 190 178, 250 178" />
          <path d="M330 174 C 380 174, 380 90, 400 90" />
        </g>
        <g>
          <rect x="250" y="150" width="80" height="44" rx="10" fill="#12161c" stroke="oklch(0.82 0.13 195 / 0.6)" />
          <circle cx="264" cy="172" r="4" fill={ACCENT} />
          <text x="274" y="176" fill="#cdd2d8" fontFamily="'IBM Plex Mono',monospace" fontSize="10.5">Maestro</text>
        </g>
        <g>
          <rect x="46" y="66" width="80" height="46" rx="10" fill="#12161c" stroke="#2a2e36" />
          <circle cx="60" cy="89" r="4" fill="#7dd3c0" />
          <text x="70" y="93" fill="#9aa0a8" fontFamily="'IBM Plex Mono',monospace" fontSize="9.5">terminal</text>
        </g>
        <g>
          <rect x="46" y="228" width="80" height="46" rx="10" fill="#12161c" stroke="#2a2e36" />
          <circle cx="60" cy="251" r="4" fill="#7dd3c0" />
          <text x="70" y="255" fill="#9aa0a8" fontFamily="'IBM Plex Mono',monospace" fontSize="9.5">cli agent</text>
        </g>
        {/* unconnected -> no access */}
        <g opacity="0.5">
          <rect x="378" y="66" width="48" height="46" rx="10" fill="#101216" stroke="#22252c" strokeDasharray="3 3" />
          <text x="402" y="93" fill="#6b7280" fontFamily="'IBM Plex Mono',monospace" fontSize="10" textAnchor="middle">note</text>
        </g>
      </svg>
      <div className="preview__caption">
        edge = permission
        <span> → agent sees only what connects to it</span>
      </div>
    </div>
  )
}

function Hero({ heroRef }) {
  return (
    <section className="shell hero" id="top">
      <div className="hero__copy" ref={heroRef}>
        <p className="hero__badge" data-reveal>
          <span />
          Open-source · Windows-first
        </p>
        <h1 data-reveal style={{ '--i': 1 }}>
          Orchestrate AI agents on an <em>infinite</em> visual canvas.
        </h1>
        <p className="hero__lead" data-reveal style={{ '--i': 2 }}>
          Terminals, notes, and CLI agents become connectable nodes. The connection <em>is</em> the
          permission. An agent only sees and talks to what an edge links to it.
        </p>
        <div className="hero__cta" data-reveal style={{ '--i': 3 }}>
          <DownloadButton href={DOWNLOAD_MSI} />
          <a className="btn btn--ghost" href={GITHUB_URL}>
            <Icon name="github" />
            View on GitHub
          </a>
        </div>
        <div data-reveal style={{ '--i': 4 }}>
          <InstallerNote />
        </div>
      </div>
      <CanvasPreview />
    </section>
  )
}

function Features() {
  return (
    <section className="shell section" id="features">
      <SectionHead eyebrow="// how it works" title="A canvas built for orchestrating agents, not another chat window." />
      <div className="grid-3">
        {FEATURES.map((f, i) => (
          <article key={f.title} className="card" data-reveal style={{ '--i': i % 3 }} onPointerMove={spotlight}>
            <div className="card__icon">
              <Icon name={f.icon} />
            </div>
            <h3 className="card__title">{f.title}</h3>
            <p className="card__body">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function Agents() {
  return (
    <section className="shell section" id="agents">
      <SectionHead
        eyebrow="// works with your agents"
        title="Bring the coding agents you already use."
        body="Drop any supported CLI agent onto the canvas as a node. More integrations are landing continuously."
      />
      <div className="grid-3">
        {AGENTS.map((a, i) => (
          <article key={a.name} className="card agent" data-reveal style={{ ...a.tone, '--i': i }} onPointerMove={spotlight}>
            <div className="agent__top">
              <div className="agent__icon">
                <Icon name={a.icon} size={19} />
              </div>
              <span className="pill pill--ok">Available</span>
            </div>
            <div>
              <h3 className="card__title">{a.name}</h3>
              <p className="card__body">{a.body}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="roadmap" data-reveal>
        <span className="pill">In development</span>
        <p>Aider, Gemini CLI, Cline and more integrations are on the way. Bring your own agent by wrapping any command.</p>
      </div>
    </section>
  )
}

function Workflow() {
  const active = useActiveStep()
  return (
    <section className="shell section steps" id="workflow">
      <aside className="steps__rail">
        <p className="eyebrow">// from zero to orchestration</p>
        <h2>Four steps to a working agent graph.</h2>
        <ol className="steps__dots">
          {STEPS.map((step, i) => (
            <li key={step.n} className={`steps__dot${i === active ? ' is-active' : ''}`}>
              {step.n} · {step.title}
            </li>
          ))}
        </ol>
      </aside>
      <div>
        {STEPS.map((step, i) => (
          <article key={step.n} className={`step${i === active ? ' is-active' : ''}`} data-step={i}>
            <span className="step__n">{step.n}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function OpenSource() {
  return (
    <section className="shell section">
      <div className="panel split" data-reveal>
        <div>
          <p className="eyebrow">// open by design</p>
          <h2>Yours to inspect, fork and extend.</h2>
          <p>
            Orkai is MIT-licensed and fully open-source. Read the code that runs your agents, self-host
            nothing, and shape the roadmap in the open.
          </p>
          <div className="split__actions">
            <a className="btn btn--ghost btn--sm" href={GITHUB_URL}>
              <Icon name="github" />
              Star on GitHub
            </a>
            <a className="btn btn--sm" href={`${GITHUB_URL}#readme`} style={{ color: 'var(--ink-2)' }}>
              Read the docs
            </a>
          </div>
        </div>
        <div className="stats">
          {STATS.map((stat) => (
            <div key={stat.v} className="stat">
              <div className="stat__v" style={{ color: stat.accent ? 'var(--accent)' : 'var(--ink)' }}>
                {stat.v}
              </div>
              <div className="stat__label">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Requirements() {
  return (
    <section className="shell section" id="requirements">
      <div className="panel split" data-reveal>
        <div>
          <p className="eyebrow">// requirements</p>
          <h2>Windows-first, natively lightweight.</h2>
          <p>
            Orkai is a native desktop app built with Rust + Tauri, not a web page. It ships as a small{' '}
            <span className="mono" style={{ color: 'var(--ink)' }}>.msi</span> and runs on the system
            WebView. Windows is the primary, first-class target.
          </p>
        </div>
        <ul className="reqs">
          {REQUIREMENTS.map((req) => (
            <li key={req.text} className={req.muted ? 'is-muted' : undefined}>
              {req.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="shell section">
      <div className="cta" data-reveal>
        <h2>Wire up your agents. Ship faster.</h2>
        <p>Free and open-source. Download the installer and open your first canvas in seconds.</p>
        <DownloadButton href={DOWNLOAD_MSI} size="lg" />
        <InstallerNote />
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer__inner">
        <div className="footer__brand">
          <span className="footer__mark" aria-hidden="true" />
          Orkai · open-source visual agent orchestration
        </div>
        <div className="footer__meta">
          <a href={GITHUB_URL}>GitHub</a>
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
  const heroRef = useRef(null)
  const reduced = usePrefersReducedMotion()
  const scrolled = useScrollFx(heroRef)
  useReveal()

  return (
    <>
      <GraphScene reduced={reduced} />
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="page">
        <Header scrolled={scrolled} />
        <main id="main" tabIndex={-1}>
          <Hero heroRef={heroRef} />
          <Features />
          <Agents />
          <Workflow />
          <OpenSource />
          <Requirements />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </>
  )
}
