import { describe, expect, it } from 'vitest'
import { emptyTimeline, addItem } from '@shared/timeline'
import { defaultGraph } from '@shared/graph'
import type { AppState } from '@shared/types'
import { Sequencer, beatTriggered, itemDuration, loopTarget, pickVideoId } from './timeline'

const DT = 1 / 60

/** Numer kroku (od 1), w którym `step` zwróciło true; -1, gdy wcale. */
function cutAt(
  item: { id: string; duration: number; waitBeat: boolean },
  steps: number,
  beatAt: (step: number) => boolean = () => false
): number {
  const s = new Sequencer()
  for (let i = 1; i <= steps; i++) if (s.step(DT, beatAt(i), item)) return i
  return -1
}

describe('Sequencer', () => {
  it('bez czekania na beat tnie po czasie elementu', () => {
    const at = cutAt({ id: 'a', duration: 2, waitBeat: false }, 400)
    expect(Math.abs(at - 120)).toBeLessThanOrEqual(1)
  })

  it('z czekaniem: beat przed czasem nic nie daje, pierwszy beat po czasie tnie', () => {
    const item = { id: 'a', duration: 2, waitBeat: true }
    expect(cutAt(item, 200, (i) => i === 60)).toBe(-1)
    expect(cutAt(item, 300, (i) => i === 60 || i === 150)).toBe(150)
  })

  it('z czekaniem i ciszą tnie najpóźniej 4 s po czasie elementu', () => {
    const at = cutAt({ id: 'a', duration: 2, waitBeat: true }, 600)
    expect(Math.abs(at - 360)).toBeLessThanOrEqual(1)
  })

  it('tnie raz na element, nowe id liczy od zera, brak elementu zeruje', () => {
    const s = new Sequencer()
    const a = { id: 'a', duration: 1, waitBeat: false }
    let cuts = 0
    for (let i = 0; i < 300; i++) if (s.step(DT, false, a)) cuts++
    expect(cuts).toBe(1)
    const b = { id: 'b', duration: 1, waitBeat: false }
    let at = -1
    for (let i = 1; i <= 100 && at < 0; i++) if (s.step(DT, false, b)) at = i
    expect(Math.abs(at - 60)).toBeLessThanOrEqual(1)
    expect(s.step(DT, true, null)).toBe(false)
  })
})

describe('Sequencer – czekanie na załadowanie klipu', () => {
  it('nie liczy czasu, dopóki nowy klip nie gra (najwyżej 2 s)', () => {
    const s = new Sequencer()
    const item = { id: 'a', duration: 1, waitBeat: false }
    for (let i = 0; i < 60; i++) expect(s.step(DT, false, item, false)).toBe(false)
    let at = -1
    for (let i = 1; i <= 120 && at < 0; i++) if (s.step(DT, false, item, true)) at = i
    expect(Math.abs(at - 60)).toBeLessThanOrEqual(1)
  })

  it('klip, który się nie ładuje, po 2 s i tak zaczyna liczyć czas', () => {
    const s = new Sequencer()
    const item = { id: 'a', duration: 1, waitBeat: false }
    let at = -1
    for (let i = 1; i <= 400 && at < 0; i++) if (s.step(DT, false, item, false)) at = i
    expect(Math.abs(at - 180)).toBeLessThanOrEqual(2)
  })
})

describe('beatTriggered', () => {
  it('true tylko w klatce uderzenia (obwiednia = 1)', () => {
    expect(beatTriggered(1)).toBe(true)
    expect(beatTriggered(0.92)).toBe(false)
  })
})

describe('loopTarget (fragment od–do)', () => {
  it('przewija na początek fragmentu na jego końcu i przed nim', () => {
    expect(loopTarget(15.0, 30, 12, 15)).toBe(12)
    expect(loopTarget(13.5, 30, 12, 15)).toBeNull()
    expect(loopTarget(3, 30, 12, 15)).toBe(12)
  })

  it('bez outPoint i z outPoint dłuższym niż plik pętla idzie do końca pliku', () => {
    expect(loopTarget(29.995, 30, 0, null)).toBe(0)
    expect(loopTarget(10, 8, 2, 20)).toBe(2)
  })

  it('inPoint poza plikiem traktuje jak 0', () => {
    expect(loopTarget(5, 4, 9, null)).toBe(0)
  })

  it('nieznana długość pliku (NaN) = bez końca pliku', () => {
    expect(loopTarget(14, NaN, 12, 15)).toBeNull()
    expect(loopTarget(15, NaN, 12, 15)).toBe(12)
  })
})

describe('pickVideoId', () => {
  const lib = ['a', 'b'].map((id) => ({ id, name: id, size: 1, duration: null, thumb: null }))
  const state = (playing: boolean, videoId: string): AppState =>
    ({
      library: lib,
      activeId: 'a',
      timeline: { ...addItem(emptyTimeline(), videoId, defaultGraph(), 'i0'), playing }
    }) as AppState

  it('gdy kolejka gra, wygrywa klip bieżącego elementu (nawet nad stałym plikiem node’a)', () => {
    expect(pickVideoId(state(true, 'b'), 'a')).toBe('b')
  })

  it('zatrzymana kolejka z połączonym ujęciem (edycja) też pokazuje jego klip', () => {
    const st = state(false, 'b')
    expect(pickVideoId({ ...st, timeline: { ...st.timeline, linked: true } }, 'a')).toBe('b')
  })

  it('gdy kolejka stoi albo klipu nie ma w bibliotece – jak dotąd', () => {
    expect(pickVideoId(state(false, 'b'), 'a')).toBe('a')
    expect(pickVideoId(state(false, 'b'), null)).toBe('a')
    expect(pickVideoId(state(true, 'gone'), 'b')).toBe('b')
    expect(pickVideoId(state(true, 'gone'), 'zzz')).toBe('a')
  })
})

describe('itemDuration (czas elementu dla zegara cięć)', () => {
  const base = { duration: 16, loop: false, inPoint: 2, outPoint: 4.5 as number | null }

  it('bez pętli: element trwa tyle, co fragment (jedno przejście)', () => {
    expect(itemDuration(base, 30)).toBeCloseTo(2.5)
    expect(itemDuration({ ...base, outPoint: null }, 30)).toBeCloseTo(28)
    expect(itemDuration({ ...base, outPoint: 99 }, 10)).toBeCloseTo(8)
  })

  it('z pętlą: ustawiony czas', () => {
    expect(itemDuration({ ...base, loop: true }, 30)).toBe(16)
  })

  it('nieznana długość pliku bez outPoint → ustawiony czas', () => {
    expect(itemDuration({ ...base, outPoint: null }, null)).toBe(16)
    expect(itemDuration(base, null)).toBeCloseTo(2.5)
  })
})
