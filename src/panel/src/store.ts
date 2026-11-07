// Stan panelu (Zustand). Zmiany są nanoszone lokalnie od razu i wysyłane do
// serwera; serwer odsyła pełny stan albo lekką łatkę parametru.

import { create } from 'zustand'
import { deleteElements, setParam, splitPort } from '@shared/graph'
import { findNumberParam } from '@shared/nodes'
import type { AppState, AudioLevels, Graph, ParamValue } from '@shared/types'
import { connection } from './api'

export type Tab = 'effects' | 'graph'
/** Tryb edytora grafu: łączenie i dodawanie albo usuwanie kliknięciem. */
export type GraphMode = 'edit' | 'delete'

interface PanelState {
  app: AppState | null
  connected: boolean
  audio: AudioLevels
  selected: string | null
  tab: Tab
  graphMode: GraphMode
}

export const usePanel = create<PanelState>(() => ({
  app: null,
  connected: false,
  audio: { bass: 0, mid: 0, high: 0, level: 0, beat: 0 },
  selected: null,
  tab: 'effects',
  graphMode: 'edit'
}))

const patchApp = (fn: (app: AppState) => AppState): void =>
  usePanel.setState((s) => (s.app ? { app: fn(s.app) } : s))

connection.onStatus((connected) => usePanel.setState({ connected }))
connection.onMessage((msg) => {
  switch (msg.type) {
    case 'state': {
      const { type: _type, ...app } = msg
      usePanel.setState((s) => ({
        app,
        selected: s.selected && app.graph.nodes.some((n) => n.id === s.selected) ? s.selected : null
      }))
      break
    }
    case 'param':
      patchApp((app) => ({ ...app, graph: setParam(app.graph, msg.node, msg.param, msg.value) }))
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
  patchApp((app) => ({ ...app, graph: setParam(app.graph, node, param, value) }))
  connection.send({ type: 'effects:set', node, param, value })
}

export function setBypass(node: string, bypass: boolean): void {
  connection.send({ type: 'node:bypass', node, bypass })
}

/** Zmiana struktury grafu: lokalnie + do serwera. */
export function commitGraph(graph: Graph): void {
  setGraphLocal(graph)
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
