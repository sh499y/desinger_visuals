import { Fragment, useEffect, useState } from 'react'
import { EffectsView } from './components/EffectsView'
import { Library } from './components/Library'
import { NodeEditor } from './components/NodeEditor'
import {
  AudioPanel,
  OutputPanel,
  Preview,
  ProjectsPanel,
  TemplatesPanel
} from './components/Sidebar'
import { Tag } from './components/ui'
import { redo, setLan, setTab, undo, usePanel, type Tab } from './store'

const TABS: { id: Tab; label: string }[] = [
  { id: 'effects', label: 'Efekty' },
  { id: 'graph', label: 'Graf' }
]

// Pikselowy font 3×5 złożony z półbloków.
const LOGO = [
  '█ █ ▀█▀ █▀▀ █ █ █▀█ █   ▀█▀ ▀▀█ █▀▀ █▀▄',
  '█ █  █  ▀▀█ █ █ █▀█ █    █  ▄▀  █▀  █▀▄',
  ' ▀  ▀▀▀ ▀▀▀ ▀▀▀ ▀ ▀ ▀▀▀ ▀▀▀ ▀▀▀ ▀▀▀ ▀ ▀'
].join('\n')

const SPINNER = ['|', '/', '-', '\\']

function Tabs(): React.JSX.Element {
  const tab = usePanel((s) => s.tab)
  return (
    <nav className="flex items-center gap-2" role="tablist" aria-label="Widok">
      {TABS.map((t, i) => (
        <Fragment key={t.id}>
          {i > 0 && (
            <span aria-hidden className="font-mono text-meta text-muted">
              /
            </span>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`tap px-2 py-1 font-pixel uppercase ${tab === t.id ? 'inv' : 'inv-hover'}`}
          >
            {t.label}
          </button>
        </Fragment>
      ))}
    </nav>
  )
}

function Header(): React.JSX.Element {
  const connected = usePanel((s) => s.connected)
  const server = usePanel((s) => s.app?.server)
  return (
    <header className="surface flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
      <h1 className="font-display text-display font-medium">Visualizer</h1>
      <span className={connected ? 'text-term-green' : 'text-danger'}>
        <Tag>{connected ? 'online' : 'offline'}</Tag>
      </span>
      <Tabs />
      {server && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 lg:ml-auto">
          <label
            className="tap flex items-center gap-2"
            title="Panel dostępny z telefonu w tej samej sieci (z tokenem)"
          >
            <input
              type="checkbox"
              checked={server.lan}
              onChange={(e) => setLan(e.target.checked)}
            />
            Dostęp z sieci lokalnej
          </label>
          {server.lanUrls.map((u) => (
            <a key={u} href={u} className="link font-mono text-meta break-all text-muted">
              {new URL(u).host}
            </a>
          ))}
        </div>
      )}
    </header>
  )
}

function Connecting(): React.JSX.Element {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 120)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="surface flex max-w-full flex-col gap-4 p-6">
        <h1 className="font-display text-display-lg">Łączenie…</h1>
        <pre aria-hidden className="overflow-hidden font-mono text-meta leading-none">
          {LOGO}
        </pre>
        <p className="flex items-center gap-2 text-muted" role="status">
          <span aria-hidden className="font-mono text-meta text-fg">
            [{SPINNER[frame]}]
          </span>
          Czekam na backend Visualizera
        </p>
      </div>
    </div>
  )
}

/** Efekty: trzy kolumny (biblioteka, łańcuch, panele boczne). */
function EffectsLayout(): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto p-3 lg:flex-row lg:overflow-hidden">
      <div className="min-w-0 shrink-0 lg:w-80 lg:overflow-y-auto">
        <Library />
      </div>

      {/* Wąski ekran: wysokość z treści i przewijanie całej strony. Szeroki: kolumna z własnym scrollem. */}
      <main className="surface min-w-0 flex-none p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <EffectsView />
      </main>

      <div className="min-w-0 shrink-0 space-y-3 lg:w-80 lg:overflow-y-auto">
        <Preview />
        <TemplatesPanel />
        <AudioPanel />
        <OutputPanel />
        <ProjectsPanel />
      </div>
    </div>
  )
}

/**
 * Graf: płótno na całą resztę ekranu, panele pływają nad nim (szeroki ekran).
 * Biblioteka, Szablony, Wyjście i Projekty zwinięte; Podgląd i Audio zawsze widoczne.
 */
function GraphLayout(): React.JSX.Element {
  return (
    <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 lg:overflow-hidden lg:p-0 lg:pt-3">
      <NodeEditor
        left={<Library collapsible />}
        right={
          <>
            <Preview />
            <AudioPanel />
            <TemplatesPanel collapsible />
            <OutputPanel collapsible />
            <ProjectsPanel collapsible />
          </>
        }
      />
    </main>
  )
}

/**
 * Ctrl/Cmd+Z cofa zmianę grafu, Shift+Ctrl/Cmd+Z (albo Ctrl+Y) ją ponawia.
 * W polach tekstowych zostaje zwykłe cofanie tekstu.
 */
function useUndoKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
        const range = t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'range'
        if (!range) return
      }
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) undo()
      else if ((key === 'z' && e.shiftKey) || key === 'y') redo()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function Workspace(): React.JSX.Element {
  const tab = usePanel((s) => s.tab)
  useUndoKeys()
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3">
        <Header />
      </div>
      {tab === 'effects' ? <EffectsLayout /> : <GraphLayout />}
    </div>
  )
}

function App(): React.JSX.Element {
  const ready = usePanel((s) => s.app !== null)
  return ready ? <Workspace /> : <Connecting />
}

export default App
