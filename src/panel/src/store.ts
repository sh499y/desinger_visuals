// Stan panelu (Zustand). Zmiany są nanoszone lokalnie od razu i wysyłane do
// serwera; serwer odsyła pełny stan albo lekką łatkę parametru.

import { create } from 'zustand'
import { deleteElements, setParam, splitPort, updateNode } from '@shared/graph'
import { findNumberParam } from '@shared/nodes'
import type { AppState, AudioLevels, Graph, ParamValue } from '@shared/types'
import { connection } from './api'

export type Tab = 'effects' | 'graph'
/** Tryb edytora grafu: łączenie i dodawanie albo usuwanie kliknięciem. */
export type GraphMode = 'edit' | 'delete'
/** Wygląd node'ów CRT w edytorze grafu (preferencja tej przeglądarki). */
export type CrtSkin = 'hammertone' | 'blackpanel'

const CRT_SKIN_KEY = 'vz.crtSkin'

function loadCrtSkin(): CrtSkin {
  try {
    return localStorage.getItem(CRT_SKIN_KEY) === 'blackpanel' ? 'blackpanel' : 'hammertone'
  } catch {
    return 'hammertone'
  }
}

interface PanelState {
  app: AppState | null
  connected: boolean
  audio: AudioLevels
  selected: string | null
  tab: Tab
  graphMode: GraphMode
  crtSkin: CrtSkin
  /** Historia grafu do cofania (najstarszy pierwszy) i ponawiania. */
  undoStack: Graph[]
  redoStack: Graph[]
}

export const usePanel = create<PanelState>(() => ({
  app: null,
  connected: false,
  audio: { bass: 0, mid: 0, high: 0, level: 0, beat: 0 },
  selected: null,
  tab: 'effects',
  graphMode: 'edit',
  crtSkin: loadCrtSkin(),
  undoStack: [],
  redoStack: []
}))

// --- Cofanie ---

const HISTORY_MAX = 50
/** Ciągła zmiana tego samego parametru (suwak, pokrętło) w tym oknie to jeden krok. */
const COALESCE_MS = 1500
let lastEdit: { key: string; at: number } | null = null
/**
 * Graf zgodny z serwerem (ostatni stan, param albo wysłana zmiana). Zmiany
 * lokalne w trakcie przeciągania go nie ruszają, więc zrzut do historii to
 * stan sprzed przeciągania.
 */
let synced: Graph | null = null
const syncLocal = (): void => {
  synced = usePanel.getState().app?.graph ?? synced
}

/** Zapamiętuje graf sprzed zmiany; `key` łączy serię zmian tego samego parametru. */
function record(key: string | null): void {
  const s = usePanel.getState()
  if (!s.app) return
  const now = Date.now()
  if (key && lastEdit && lastEdit.key === key && now - lastEdit.at < COALESCE_MS) {
    lastEdit.at = now
    return
  }
  lastEdit = key ? { key, at: now } : null
  usePanel.setState({
    undoStack: [...s.undoStack, synced ?? s.app.graph].slice(-HISTORY_MAX),
    redoStack: []
  })
}

function restore(from: 'undoStack' | 'redoStack'): void {
  const s = usePanel.getState()
  const stack = s[from]
  if (!s.app || stack.length === 0) return
  const graph = stack[stack.length - 1]
  const current = s.app.graph
  lastEdit = null
  usePanel.setState(
    from === 'undoStack'
      ? { undoStack: stack.slice(0, -1), redoStack: [...s.redoStack, current] }
      : { redoStack: stack.slice(0, -1), undoStack: [...s.undoStack, current] }
  )
  setGraphLocal(graph)
  synced = graph
  connection.send({ type: 'graph:set', graph })
}

/** Cofnij ostatnią zmianę grafu (Ctrl/Cmd+Z). */
export const undo = (): void => restore('undoStack')
/** Ponów cofniętą zmianę (Shift+Ctrl/Cmd+Z). */
export const redo = (): void => restore('redoStack')

const patchApp = (fn: (app: AppState) => AppState): void =>
  usePanel.setState((s) => (s.app ? { app: fn(s.app) } : s))

connection.onStatus((connected) => usePanel.setState({ connected }))
connection.onMessage((msg) => {
  switch (msg.type) {
    case 'state': {
      const { type: _type, ...app } = msg
      synced = app.graph
      usePanel.setState((s) => ({
        app,
        selected: s.selected && app.graph.nodes.some((n) => n.id === s.selected) ? s.selected : null
      }))
      break
    }
    case 'param':
      patchApp((app) => ({ ...app, graph: setParam(app.graph, msg.node, msg.param, msg.value) }))
      if (synced) synced = setParam(synced, msg.node, msg.param, msg.value)
      break
    case 'audio': {
      const { type: _type, ...audio } = msg
      usePanel.setState({ audio })
      break
    }
    case 'error':
      console.warn('Serwer:', msg.message)
      break
  }
})

export const setTab = (tab: Tab): void => usePanel.setState({ tab })
export const selectNode = (selected: string | null): void => usePanel.setState({ selected })
export const setGraphMode = (graphMode: GraphMode): void =>
  usePanel.setState(graphMode === 'delete' ? { graphMode, selected: null } : { graphMode })

export function selectVideo(id: string | null): void {
  patchApp((app) => ({ ...app, activeId: id }))
  connection.send({ type: 'playback:select', id })
}

export function setParamValue(node: string, param: string, value: ParamValue): void {
  record(`${node}.${param}`)
  patchApp((app) => ({ ...app, graph: setParam(app.graph, node, param, value) }))
  syncLocal()
  connection.send({ type: 'effects:set', node, param, value })
}

export function setCrtSkin(crtSkin: CrtSkin): void {
  usePanel.setState({ crtSkin })
  try {
    localStorage.setItem(CRT_SKIN_KEY, crtSkin)
  } catch {
    // Prywatne okno albo zablokowane dane strony: wybór działa do odświeżenia.
  }
}

export function setBypass(node: string, bypass: boolean): void {
  record(null)
  patchApp((app) => ({
    ...app,
    graph: updateNode(app.graph, node, { bypass: bypass || undefined })
  }))
  syncLocal()
  connection.send({ type: 'node:bypass', node, bypass })
}

/** Zmiana struktury grafu: lokalnie + do serwera. */
export function commitGraph(graph: Graph): void {
  if (graph !== synced) record(null)
  setGraphLocal(graph)
  synced = graph
  connection.send({ type: 'graph:set', graph })
}

/** Usuwa node'y i kable (logika w `deleteElements`) i wysyła zmianę. */
export function deleteFromGraph(nodeIds: string[], edgeIds: string[] = []): void {
  const app = usePanel.getState().app
  if (!app) return
  const graph = deleteElements(app.graph, nodeIds, edgeIds)
  if (graph === app.graph) return
  commitGraph(graph)
  const selected = usePanel.getState().selected
  if (selected && !graph.nodes.some((n) => n.id === selected)) selectNode(null)
}

/** Tylko lokalnie (np. w trakcie przeciągania node'a). */
export function setGraphLocal(graph: Graph): void {
  patchApp((app) => ({ ...app, graph }))
}

export const setAudioDevice = (deviceId: string | null): void =>
  connection.send({ type: 'audio:device', deviceId })

export const setFullscreen = (on: boolean, displayId: number | null): void =>
  connection.send({ type: 'output:fullscreen', on, displayId })

export const setLan = (enabled: boolean): void => connection.send({ type: 'settings:lan', enabled })

export const createLoopback = (): void => connection.send({ type: 'audio:loopback' })

/**
 * Domyślny kabel do parametru: sygnał 0..1 dodaje do bieżącej wartości
 * do połowy zakresu parametru.
 */
export function defaultBinding(graph: Graph, to: string): { scale: number; offset: number } {
  const { node, port } = splitPort(to)
  const n = graph.nodes.find((x) => x.id === node)
  const def = n && findNumberParam(n.type, port)
  if (!n || !def) return { scale: 1, offset: 0 }
  const current = typeof n.params[port] === 'number' ? (n.params[port] as number) : def.default
  return { scale: round((def.max - def.min) / 2), offset: round(current) }
}

const round = (v: number): number => Math.round(v * 10000) / 10000
