// Stan aplikacji trzymany przez serwer. Każda zmiana idzie do słuchaczy
// (klienci WebSocket i okno wizualizacji), a graf/wybór są zapisywane na dysk.

import { readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { defaultGraph, sanitizeGraph, sanitizeParam, updateNode } from '@shared/graph'
import type {
  AppState,
  AudioLevels,
  AudioStatus,
  DisplayInfo,
  Graph,
  LoopbackStatus,
  ParamValue,
  ServerInfo,
  ServerMessage,
  VideoItem
} from '@shared/types'

interface Persisted {
  graph?: unknown
  activeId?: unknown
  audioDeviceId?: unknown
}

type Listener = (msg: ServerMessage) => void

export class AppStore {
  private state: AppState
  private listeners = new Set<Listener>()
  private persistTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly persistPath: string,
    server: ServerInfo
  ) {
    let saved: Persisted = {}
    try {
      saved = JSON.parse(readFileSync(persistPath, 'utf8'))
    } catch {
      // pierwszy start
    }
    this.state = {
      library: [],
      activeId: typeof saved.activeId === 'string' ? saved.activeId : null,
      graph: saved.graph ? sanitizeGraph(saved.graph) : defaultGraph(),
      audio: {
        deviceId: typeof saved.audioDeviceId === 'string' ? saved.audioDeviceId : null,
        devices: [],
        activeId: null,
        activeLabel: null,
        error: null,
        loopback: { state: 'unavailable', error: null }
      },
      output: { fullscreen: false, displays: [] },
      server
    }
  }

  get(): AppState {
    return this.state
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  stateMessage(): ServerMessage {
    return { type: 'state', ...this.state }
  }

  private emit(msg: ServerMessage): void {
    for (const fn of this.listeners) fn(msg)
  }

  private update(patch: Partial<AppState>, persist = false): void {
    this.state = { ...this.state, ...patch }
    this.emit(this.stateMessage())
    if (persist) this.schedulePersist()
  }

  setLibrary(library: VideoItem[]): void {
    const ids = new Set(library.map((v) => v.id))
    let activeId = this.state.activeId
    if (activeId === null || !ids.has(activeId)) activeId = library[0]?.id ?? null
    this.update({ library, activeId }, activeId !== this.state.activeId)
  }

  select(id: string | null): void {
    if (id !== null && !this.state.library.some((v) => v.id === id)) return
    this.update({ activeId: id }, true)
  }

  /** Zmiana jednego parametru: wysyła lekką łatkę zamiast pełnego stanu. */
  setParam(nodeId: string, param: string, value: unknown): void {
    const node = this.state.graph.nodes.find((n) => n.id === nodeId)
    if (!node) return
    const v: ParamValue | undefined = sanitizeParam(node.type, param, value)
    if (v === undefined) return
    const nodes = this.state.graph.nodes.map((n) =>
      n === node ? { ...n, params: { ...n.params, [param]: v } } : n
    )
    this.state = { ...this.state, graph: { ...this.state.graph, nodes } }
    this.emit({ type: 'param', node: nodeId, param, value: v })
    this.schedulePersist()
  }

  setBypass(nodeId: string, bypass: boolean): void {
    this.update(
      { graph: updateNode(this.state.graph, nodeId, { bypass: bypass || undefined }) },
      true
    )
  }

  setGraph(graph: unknown): void {
    this.update({ graph: sanitizeGraph(graph) }, true)
  }

  loadGraph(graph: Graph): void {
    this.update({ graph }, true)
  }

  setAudioDevice(deviceId: string | null): void {
    this.update({ audio: { ...this.state.audio, deviceId } }, true)
  }

  setAudioStatus(status: AudioStatus): void {
    this.update({ audio: { ...this.state.audio, ...status } })
  }

  setLoopback(loopback: LoopbackStatus): void {
    this.update({ audio: { ...this.state.audio, loopback } })
  }

  setOutput(patch: Partial<{ fullscreen: boolean; displays: DisplayInfo[] }>): void {
    this.update({ output: { ...this.state.output, ...patch } })
  }

  setServer(server: ServerInfo): void {
    this.update({ server })
  }

  audio(levels: AudioLevels): void {
    this.emit({ type: 'audio', ...levels })
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => void this.persist(), 500)
  }

  async persist(): Promise<void> {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = null
    const data: Persisted = {
      graph: this.state.graph,
      activeId: this.state.activeId,
      audioDeviceId: this.state.audio.deviceId
    }
    await writeFile(this.persistPath, JSON.stringify(data)).catch(() => {})
  }
}
