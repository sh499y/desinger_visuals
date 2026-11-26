import { describe, expect, it } from 'vitest'
import { defaultGraph, sanitizeGraph } from './graph'
import {
  TIMELINE_LIMITS,
  addItem,
  emptyTimeline,
  moveItem,
  nextIndex,
  removeItem,
  sanitizeTimeline,
  updateItem
} from './timeline'
import type { Timeline } from './types'

const g = defaultGraph()

/** Kolejka z klipami o podanych videoId; id elementów = `i<pozycja>`. */
function queue(videoIds: string[], index = 0, playing = true): Timeline {
  let t = emptyTimeline()
  videoIds.forEach((v, i) => (t = addItem(t, v, g, `i${i}`)))
  return { ...t, index, playing }
}
const ids = (t: Timeline): string[] => t.items.map((i) => i.id)
const current = (t: Timeline): string => t.items[t.index].id

describe('sanitizeTimeline', () => {
  it('linked tylko jako true przy niepustej kolejce', () => {
    expect(sanitizeTimeline({ linked: true, items: [{ videoId: 'v' }] }).linked).toBe(true)
    expect(sanitizeTimeline({ linked: 1, items: [{ videoId: 'v' }] }).linked).toBe(false)
    expect(sanitizeTimeline({ linked: true, items: [] }).linked).toBe(false)
    expect(removeItem({ ...queue(['a']), linked: true }, 'i0').linked).toBe(false)
  })

  it('śmieci → pusta kolejka', () => {
    expect(sanitizeTimeline(null)).toEqual(emptyTimeline())
    expect(sanitizeTimeline({ items: 'x' })).toEqual(emptyTimeline())
  })

  it('przycina wartości elementu i czyści graf', () => {
    const t = sanitizeTimeline({
      playing: true,
      index: 0,
      items: [{ id: 'a', videoId: 'v', duration: 9999, inPoint: -3, outPoint: 0.05, graph: 5 }]
    })
    expect(t.items[0]).toEqual({
      id: 'a',
      videoId: 'v',
      graph: sanitizeGraph(5),
      duration: 600,
      waitBeat: true,
      loop: false,
      inPoint: 0,
      outPoint: null
    })
  })

  it('brakujące pola dostają domyślne, element bez videoId wypada, index poza zakresem → 0', () => {
    const t = sanitizeTimeline({ index: 7, items: [{ videoId: 'v' }, { id: 'x' }] })
    expect(t.items).toHaveLength(1)
    expect(t.items[0]).toMatchObject({
      id: 'item-0',
      duration: 16,
      waitBeat: true,
      inPoint: 0,
      outPoint: null
    })
    expect(t.index).toBe(0)
    expect(t.playing).toBe(false)
  })

  it('outPoint musi być ≥ inPoint + 0,1 s', () => {
    const t = sanitizeTimeline({
      items: [
        { videoId: 'v', inPoint: 3, outPoint: 6 },
        { videoId: 'w', inPoint: 3, outPoint: 3.05 }
      ]
    })
    expect(t.items[0].outPoint).toBe(6)
    expect(t.items[1].outPoint).toBeNull()
  })

  it(`najwyżej ${TIMELINE_LIMITS.maxItems} elementów`, () => {
    const items = Array.from({ length: 300 }, () => ({ videoId: 'v' }))
    expect(sanitizeTimeline({ items }).items).toHaveLength(TIMELINE_LIMITS.maxItems)
  })
})

describe('operacje na kolejce', () => {
  it('addItem dopisuje na końcu z domyślnymi wartościami, nie rusza index', () => {
    const t = addItem(queue(['a', 'b'], 1), 'c', g, 'new')
    expect(ids(t)).toEqual(['i0', 'i1', 'new'])
    expect(t.index).toBe(1)
    expect(t.items[2]).toEqual({
      id: 'new',
      videoId: 'c',
      graph: g,
      duration: 16,
      waitBeat: true,
      loop: false,
      inPoint: 0,
      outPoint: null
    })
  })

  it('removeItem przed bieżącym przesuwa index, bieżący → następny, ostatni → 0, pusta → stop', () => {
    expect(current(removeItem(queue(['a', 'b', 'c'], 2), 'i0'))).toBe('i2')
    expect(current(removeItem(queue(['a', 'b', 'c'], 1), 'i1'))).toBe('i2')
    expect(removeItem(queue(['a', 'b', 'c'], 2), 'i2').index).toBe(0)
    const empty = removeItem(queue(['a']), 'i0')
    expect(empty.items).toEqual([])
    expect(empty.playing).toBe(false)
  })

  it('moveItem: bieżący element zostaje bieżącym', () => {
    const moved = moveItem(queue(['a', 'b', 'c', 'd'], 1), 'i1', 3)
    expect(ids(moved)).toEqual(['i0', 'i2', 'i3', 'i1'])
    expect(current(moved)).toBe('i1')
    const other = moveItem(queue(['a', 'b', 'c', 'd'], 1), 'i3', 0)
    expect(ids(other)).toEqual(['i3', 'i0', 'i1', 'i2'])
    expect(current(other)).toBe('i1')
    expect(ids(moveItem(queue(['a', 'b']), 'i0', 99))).toEqual(['i1', 'i0'])
  })

  it('updateItem waliduje jak sanitize, nieznane id → bez zmian', () => {
    const t = queue(['a'])
    expect(updateItem(t, 'i0', { duration: 0 }).items[0].duration).toBe(1)
    expect(
      updateItem(t, 'i0', { inPoint: 2, outPoint: 5, waitBeat: false }).items[0]
    ).toMatchObject({
      inPoint: 2,
      outPoint: 5,
      waitBeat: false
    })
    expect(updateItem(t, 'nope', { duration: 5 })).toBe(t)
    expect(updateItem(t, 'i0', { loop: true }).items[0].loop).toBe(true)
  })

  it('nextIndex pomija klipy spoza biblioteki, zawija, null gdy żadnego nie ma', () => {
    const t = queue(['a', 'gone', 'c'], 0)
    expect(nextIndex(t, new Set(['a', 'c']))).toBe(2)
    expect(nextIndex({ ...t, index: 2 }, new Set(['a', 'c']))).toBe(0)
    expect(nextIndex(t, new Set())).toBeNull()
    expect(nextIndex(queue(['a', 'gone'], 0), new Set(['a']))).toBe(0)
  })
})
