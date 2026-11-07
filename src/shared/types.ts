// Typy wspólne dla procesu głównego (serwer), okna wizualizacji i panelu.
// Tylko typy i stałe: bez importów z Electrona, Node ani DOM.

import type { NodeType } from './nodes'

export interface VideoItem {
  id: string
  name: string
  size: number
  /** Długość w sekundach, gdy panel już ją odczytał. */
  duration: number | null
  /** URL miniatury względem serwera albo null. */
  thumb: string | null
}

export type ParamValue = number | boolean | string | null

export interface GraphNode {
  id: string
  type: NodeType
  params: Record<string, ParamValue>
  bypass?: boolean
  position?: { x: number; y: number }
}

export interface GraphEdge {
  /** "nodeId.port" */
  from: string
  /** "nodeId.port" albo "nodeId.param" */
  to: string
  scale?: number
  offset?: number
}

export interface Graph {
  version: 1
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface AudioLevels {
  bass: number
  mid: number
  high: number
  level: number
  beat: number
}

export interface AudioDeviceInfo {
  deviceId: string
  label: string
}

export interface AudioStatus {
  devices: AudioDeviceInfo[]
  activeId: string | null
  activeLabel: string | null
  error: string | null
}

/** Wirtualne wejście z monitora wyjścia (Linux, pactl). */
export interface LoopbackStatus {
  state: 'unavailable' | 'off' | 'on'
  error: string | null
}

export interface DisplayInfo {
  id: number
  label: string
  width: number
  height: number
  primary: boolean
}

export interface ServerInfo {
  port: number
  /** Adres serwera na loopbacku, używany przez okno wizualizacji. */
  localUrl: string
  /** Adres panelu do otwarcia w przeglądarce. */
  panelUrl: string
  lan: boolean
  /** Adresy panelu w sieci lokalnej (z tokenem), gdy LAN jest włączony. */
  lanUrls: string[]
}

export interface AppState {
  library: VideoItem[]
  activeId: string | null
  graph: Graph
  audio: AudioStatus & { deviceId: string | null; loopback: LoopbackStatus }
  output: { fullscreen: boolean; displays: DisplayInfo[] }
  server: ServerInfo
}

export interface ProjectInfo {
  name: string
  savedAt: number
}

/** Panel → serwer (WebSocket). */
export type ClientMessage =
  | { type: 'playback:select'; id: string | null }
  | { type: 'effects:set'; node: string; param: string; value: ParamValue }
  | { type: 'node:bypass'; node: string; bypass: boolean }
  | { type: 'graph:set'; graph: Graph }
  | { type: 'audio:device'; deviceId: string | null }
  | { type: 'audio:loopback' }
  | { type: 'output:fullscreen'; on: boolean; displayId?: number | null }
  | { type: 'settings:lan'; enabled: boolean }

/** Serwer → panel (WebSocket) i serwer → okno wizualizacji (IPC). */
export type ServerMessage =
  | ({ type: 'state' } & AppState)
  | { type: 'param'; node: string; param: string; value: ParamValue }
  | ({ type: 'audio' } & AudioLevels)
  | { type: 'error'; message: string }

/** Dane startowe okna wizualizacji. */
export interface FrontInit {
  state: AppState
  /** Klucz dodawany do /media, żeby serwer odesłał nagłówek CORS (tekstury WebGL). */
  mediaKey: string
}

/** API wystawione przez preload jako window.api. */
export interface FrontApi {
  init(): Promise<FrontInit>
  onMessage(cb: (msg: ServerMessage) => void): () => void
  sendAudio(levels: AudioLevels): void
  sendAudioStatus(status: AudioStatus): void
  openPanel(): void
}

export const DEFAULT_PORT = 4000
export const AUDIO_SEND_INTERVAL_MS = 100
