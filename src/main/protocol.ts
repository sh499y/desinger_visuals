// Walidacja wiadomości od klientów (panel w przeglądarce, okno wizualizacji).
// Wszystko, co przychodzi z zewnątrz, jest niezaufane.

import type {
  AudioLevels,
  AudioStatus,
  ClientMessage,
  ParamValue,
  TimelinePatch
} from '@shared/types'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isStr = (v: unknown, max = 128): v is string => typeof v === 'string' && v.length <= max
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Tylko znane pola o dobrych typach; zakresy pilnuje updateItem. */
function parsePatch(v: Record<string, unknown>): TimelinePatch {
  const p: TimelinePatch = {}
  if (isNum(v.duration)) p.duration = v.duration
  if (typeof v.waitBeat === 'boolean') p.waitBeat = v.waitBeat
  if (typeof v.loop === 'boolean') p.loop = v.loop
  if (isNum(v.inPoint)) p.inPoint = v.inPoint
  if (v.outPoint === null || isNum(v.outPoint)) p.outPoint = v.outPoint
  return p
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(m)) return null
  switch (m.type) {
    case 'playback:select':
      return m.id === null || isStr(m.id, 64) ? { type: m.type, id: m.id } : null
    case 'effects:set':
      if (!isStr(m.node, 64) || !isStr(m.param, 64)) return null
      if (!(m.value === null || ['number', 'boolean', 'string'].includes(typeof m.value)))
        return null
      return { type: m.type, node: m.node, param: m.param, value: m.value as ParamValue }
    case 'node:bypass':
      return isStr(m.node, 64) && typeof m.bypass === 'boolean'
        ? { type: m.type, node: m.node, bypass: m.bypass }
        : null
    case 'graph:set':
      // Pełna walidacja w sanitizeGraph.
      return isObj(m.graph) ? { type: m.type, graph: m.graph as never } : null
    case 'audio:device':
      return m.deviceId === null || isStr(m.deviceId, 256)
        ? { type: m.type, deviceId: m.deviceId }
        : null
    case 'output:fullscreen':
      if (typeof m.on !== 'boolean') return null
      return {
        type: m.type,
        on: m.on,
        displayId: isNum(m.displayId) ? m.displayId : null
      }
    case 'settings:lan':
      return typeof m.enabled === 'boolean' ? { type: m.type, enabled: m.enabled } : null
    case 'audio:loopback':
      return { type: m.type }
    case 'timeline:add':
      return isStr(m.videoId, 64) ? { type: m.type, videoId: m.videoId } : null
    case 'timeline:remove':
      return isStr(m.id, 64) ? { type: m.type, id: m.id } : null
    case 'timeline:move':
      return isStr(m.id, 64) && isNum(m.to) ? { type: m.type, id: m.id, to: m.to } : null
    case 'timeline:update':
      return isStr(m.id, 64) && isObj(m.patch)
        ? { type: m.type, id: m.id, patch: parsePatch(m.patch) }
        : null
    case 'timeline:play':
      return typeof m.playing === 'boolean' ? { type: m.type, playing: m.playing } : null
    case 'timeline:goto':
      return isNum(m.index) ? { type: m.type, index: m.index } : null
    default:
      return null
  }
}

export function parseAudioLevels(v: unknown): AudioLevels | null {
  if (!isObj(v)) return null
  const keys = ['bass', 'mid', 'high', 'level', 'beat'] as const
  if (!keys.every((k) => isNum(v[k]))) return null
  const c = (x: number): number => Math.min(1, Math.max(0, x))
  return {
    bass: c(v.bass as number),
    mid: c(v.mid as number),
    high: c(v.high as number),
    level: c(v.level as number),
    beat: c(v.beat as number)
  }
}

export function parseAudioStatus(v: unknown): AudioStatus | null {
  if (!isObj(v) || !Array.isArray(v.devices)) return null
  const devices = v.devices
    .filter(
      (d): d is { deviceId: string; label: string } =>
        isObj(d) && isStr(d.deviceId, 256) && isStr(d.label, 256)
    )
    .slice(0, 64)
    .map((d) => ({ deviceId: d.deviceId, label: d.label }))
  return {
    devices,
    activeId: isStr(v.activeId, 256) ? v.activeId : null,
    activeLabel: isStr(v.activeLabel, 256) ? v.activeLabel : null,
    error: isStr(v.error, 500) ? v.error : null
  }
}
