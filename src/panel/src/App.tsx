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
import { setLan, setTab, usePanel, type Tab } from './store'

const TABS: { id: Tab; label: string }[] = [
  { id: 'effects', label: 'Efekty' },
  { id: 'graph', label: 'Graf' }
]

function Header(): React.JSX.Element {
  const connected = usePanel((s) => s.connected)
  const server = usePanel((s) => s.app?.server)
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-800 px-4 py-2">
      <h1 className="text-sm font-bold tracking-wide text-white">Visualizer</h1>
      <span className="flex items-center gap-1.5 text-xs text-neutral-400">
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500'}`} />
        {connected ? 'połączono' : 'brak połączenia…'}
      </span>
      {server && (
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-neutral-400">
          <label
            className="flex items-center gap-1.5"
            title="Panel dostępny z telefonu w tej samej sieci (z tokenem)"
          >
            <input
              type="checkbox"
              checked={server.lan}
              onChange={(e) => setLan(e.target.checked)}
            />
            dostęp z sieci lokalnej
          </label>
          {server.lanUrls.map((u) => (
            <a key={u} href={u} className="text-violet-300 hover:underline">
              {new URL(u).host}
            </a>
          ))}
        </div>
      )}
    </header>
  )
}

function App(): React.JSX.Element {
  const ready = usePanel((s) => s.app !== null)
  const tab = usePanel((s) => s.tab)

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Łączenie z Visualizerem…
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:flex-row lg:overflow-hidden">
        <div className="shrink-0 lg:w-72 lg:overflow-y-auto">
          <Library />
        </div>

        {/* Wąski ekran: wysokość z treści i przewijanie całej strony. Szeroki: kolumna z własnym scrollem. */}
        <main className="flex flex-none flex-col rounded-lg border border-neutral-800 bg-neutral-900/40 lg:min-h-0 lg:flex-1">
          <nav className="flex gap-1 border-b border-neutral-800 px-2 pt-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-t px-3 py-1.5 text-xs font-medium ${
                  tab === t.id
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div
            className={`lg:min-h-0 lg:flex-1 ${tab === 'graph' ? 'h-[36rem] lg:h-auto' : 'p-3 lg:overflow-y-auto'}`}
          >
            {tab === 'effects' ? <EffectsView /> : <NodeEditor />}
          </div>
        </main>

        <div className="shrink-0 space-y-3 lg:w-80 lg:overflow-y-auto">
          <Preview />
          <TemplatesPanel />
          <AudioPanel />
          <OutputPanel />
          <ProjectsPanel />
        </div>
      </div>
    </div>
  )
}

export default App
