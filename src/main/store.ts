// Stan aplikacji trzymany przez serwer. Każda zmiana idzie do słuchaczy
// (klienci WebSocket i okno wizualizacji), a graf/wybór są zapisywane na dysk.

import { readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { defaultGraph, sanitizeGraph, sanitizeParam, updateNode } from '@shared/graph'
import {
  addItem,
  emptyTimeline,
  moveItem,
  nextIndex,
  removeItem,
  sanitizeTimeline,
  updateItem
} from '@shared/timeline'
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
  Timeline,
  TimelinePatch,
  VideoItem
} from '@shared/types'

interface Persisted {
  graph?: unknown
  activeId?: unknown
  audioDeviceId?: unknown
  timeline?: unknown
}

type Listener = (msg: ServerMessage) => void

export class AppStore {
  private state: AppState
  private listeners = new Set<Listener>()
  private persistTimer: NodeJS.Timeout | null = null
  private itemCounter = 0

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
      timeline: saved.timeline ? sanitizeTimeline(saved.timeline) : emptyTimeline(),
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
    // Klip z biblioteki = zwykły, wspólny graf (już nie efekty ujęcia z kolejki).
    this.update({ activeId: id, timeline: { ...this.state.timeline, linked: false } }, true)
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
    const graph = { ...this.state.graph, nodes }
    this.state = { ...this.state, graph, timeline: this.withCurrentGraph(graph) }
    this.emit({ type: 'param', node: nodeId, param, value: v })
    this.schedulePersist()
  }

  setBypass(nodeId: string, bypass: boolean): void {
    this.applyGraph(updateNode(this.state.graph, nodeId, { bypass: bypass || undefined }))
  }

  setGraph(graph: unknown): void {
    this.applyGraph(sanitizeGraph(graph))
  }

  loadGraph(graph: Graph): void {
    this.applyGraph(graph)
  }

  /** Nowy graf; gdy kolejka gra, zapisuje się też do bieżącego elementu. */
  private applyGraph(graph: Graph): void {
    this.update({ graph, timeline: this.withCurrentGraph(graph) }, true)
  }

  private withCurrentGraph(graph: Graph): Timeline {
    const t = this.state.timeline
    const item = t.items[t.index]
    if (!t.linked || !item) return t
    const items = [...t.items]
    items[t.index] = { ...item, graph }
    return { ...t, items }
  }

  // --- Kolejka klipów ---

  private hasVideo(id: string): boolean {
    return this.state.library.some((v) => v.id === id)
  }

  /** Ustawia kolejkę; z `apply` przełącza na klip i graf bieżącego elementu. */
  private setTimeline(timeline: Timeline, apply = false): void {
    const item = apply ? timeline.items[timeline.index] : undefined
    // Pokazany element = graf połączony z nim (edycja efektów trafia do niego).
    const patch: Partial<AppState> = { timeline: item ? { ...timeline, linked: true } : timeline }
    if (item) {
      patch.graph = item.graph
      if (this.hasVideo(item.videoId)) patch.activeId = item.videoId
    }
    this.update(patch, true)
  }

  timelineAdd(videoId: string): void {
    if (!this.hasVideo(videoId)) return
    const id = `t-${++this.itemCounter}-${Date.now().toString(36)}`
    this.setTimeline(addItem(this.state.timeline, videoId, this.state.graph, id))
  }

  timelineRemove(id: string): void {
    const t = this.state.timeline
    const wasCurrent = t.items[t.index]?.id === id
    const next = removeItem(t, id)
    // Usunięty grający element: przełącz na następny razem z jego klipem i grafem.
    this.setTimeline(next, wasCurrent && next.playing)
  }

  timelineMove(id: string, to: number): void {
    this.setTimeline(moveItem(this.state.timeline, id, to))
  }

  timelineUpdate(id: string, patch: TimelinePatch): void {
    this.setTimeline(updateItem(this.state.timeline, id, patch))
  }

  timelinePlay(playing: boolean): void {
    const t = this.state.timeline
    if (playing && t.items.length === 0) return
    this.setTimeline({ ...t, playing }, playing)
  }

  timelineGoto(index: number): void {
    const t = this.state.timeline
    if (!Number.isInteger(index) || index < 0 || index >= t.items.length) return
    this.setTimeline({ ...t, index }, true)
  }

  /** Cięcie zgłoszone przez okno wizualizacji. */
  timelineNext(): void {
    const t = this.state.timeline
    if (!t.playing) return
    const ids = new Set(this.state.library.map((v) => v.id))
    const next = nextIndex(t, ids)
    if (next === null) this.setTimeline({ ...t, playing: false })
    else this.setTimeline({ ...t, index: next }, true)
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
      audioDeviceId: this.state.audio.deviceId,
      timeline: this.state.timeline
    }
    await writeFile(this.persistPath, JSON.stringify(data)).catch(() => {})
  }
}
