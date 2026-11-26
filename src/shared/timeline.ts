// Kolejka klipów (timeline): czyste operacje na danych. Wszystko, co przychodzi
// z zewnątrz (plik stanu, panel), przechodzi przez tę samą walidację elementu.

import { sanitizeGraph } from './graph'
import type { Graph, Timeline, TimelineItem, TimelinePatch } from './types'

export const TIMELINE_LIMITS = {
  durationMin: 1,
  durationMax: 600,
  durationDefault: 16,
  /** Ile sekund po czasie elementu czekać na beat, zanim cięcie i tak nastąpi. */
  beatGrace: 4,
  /** Najkrótszy fragment od–do [s]. */
  minSpan: 0.1,
  maxItems: 200
} as const

const L = TIMELINE_LIMITS
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export function emptyTimeline(): Timeline {
  return { playing: false, linked: false, index: 0, items: [] }
}

/** Liczby elementu w zakresach; `outPoint` za blisko `inPoint` → null (do końca). */
function clean(item: TimelineItem): TimelineItem {
  const duration = isNum(item.duration)
    ? clamp(item.duration, L.durationMin, L.durationMax)
    : L.durationDefault
  const inPoint = isNum(item.inPoint) ? Math.max(0, item.inPoint) : 0
  const outPoint =
    isNum(item.outPoint) && item.outPoint >= inPoint + L.minSpan - 1e-9 ? item.outPoint : null
  return {
    ...item,
    duration,
    inPoint,
    outPoint,
    waitBeat: item.waitBeat !== false,
    loop: item.loop === true
  }
}

function cleanItem(raw: unknown, position: number): TimelineItem | null {
  if (!isObj(raw) || !isId(raw.videoId)) return null
  return clean({
    id: isId(raw.id) ? raw.id : `item-${position}`,
    videoId: raw.videoId,
    graph: sanitizeGraph(raw.graph),
    duration: raw.duration as number,
    waitBeat: raw.waitBeat as boolean,
    loop: raw.loop as boolean,
    inPoint: raw.inPoint as number,
    outPoint: raw.outPoint as number | null
  })
}

export function sanitizeTimeline(raw: unknown): Timeline {
  if (!isObj(raw) || !Array.isArray(raw.items)) return emptyTimeline()
  const items: TimelineItem[] = []
  for (const r of raw.items) {
    if (items.length >= L.maxItems) break
    const item = cleanItem(r, items.length)
    if (item) items.push(item)
  }
  const index =
    isNum(raw.index) && Number.isInteger(raw.index) && raw.index >= 0 && raw.index < items.length
      ? raw.index
      : 0
  const any = items.length > 0
  return { playing: raw.playing === true && any, linked: raw.linked === true && any, index, items }
}

export function addItem(t: Timeline, videoId: string, graph: Graph, id: string): Timeline {
  if (t.items.length >= L.maxItems) return t
  const item = clean({
    id,
    videoId,
    graph,
    duration: L.durationDefault,
    waitBeat: true,
    loop: false,
    inPoint: 0,
    outPoint: null
  })
  return { ...t, items: [...t.items, item] }
}

export function removeItem(t: Timeline, id: string): Timeline {
  const at = t.items.findIndex((i) => i.id === id)
  if (at < 0) return t
  const items = t.items.filter((_, i) => i !== at)
  let index = at < t.index ? t.index - 1 : t.index
  if (index >= items.length) index = 0
  const any = items.length > 0
  return { playing: t.playing && any, linked: t.linked && any, index, items }
}

export function moveItem(t: Timeline, id: string, to: number): Timeline {
  const from = t.items.findIndex((i) => i.id === id)
  if (from < 0) return t
  const currentId = t.items[t.index]?.id
  const items = [...t.items]
  const [item] = items.splice(from, 1)
  items.splice(clamp(Math.round(to), 0, items.length), 0, item)
  return {
    ...t,
    items,
    index: Math.max(
      0,
      items.findIndex((i) => i.id === currentId)
    )
  }
}

export function updateItem(t: Timeline, id: string, patch: TimelinePatch): Timeline {
  const at = t.items.findIndex((i) => i.id === id)
  if (at < 0) return t
  const items = [...t.items]
  items[at] = clean({ ...items[at], ...patch })
  return { ...t, items }
}

/** Następny element z klipem w bibliotece (z zawinięciem); null, gdy żadnego nie ma. */
export function nextIndex(t: Timeline, libraryIds: ReadonlySet<string>): number | null {
  const n = t.items.length
  for (let k = 1; k <= n; k++) {
    const j = (t.index + k) % n
    if (libraryIds.has(t.items[j].videoId)) return j
  }
  return null
}

/**
 * Czas elementu dla zegara cięć. Z pętlą – ustawiony `duration`; bez pętli –
 * jedno przejście fragmentu (do `outPoint` albo końca pliku). Gdy końca nie da
 * się ustalić (nieznana długość pliku), wraca do `duration`.
 */
export function itemDuration(
  item: { duration: number; loop: boolean; inPoint: number; outPoint: number | null },
  fileDuration: number | null
): number {
  if (item.loop) return item.duration
  const fd =
    fileDuration !== null && Number.isFinite(fileDuration) && fileDuration > 0 ? fileDuration : null
  let end = item.outPoint ?? fd
  if (end === null) return item.duration
  if (fd !== null && fd < end) end = fd
  const start = fd !== null && item.inPoint >= fd ? 0 : item.inPoint
  return Math.max(0.1, end - start)
}
