// Kolejka klipów po stronie okna wizualizacji: zegar cięć (czas elementu,
// potem najbliższy beat, najpóźniej po `beatGrace`).

import { TIMELINE_LIMITS } from '@shared/timeline'

export { itemDuration } from '@shared/timeline'
import type { AppState } from '@shared/types'

const EPS = 1e-6
/** Najdłużej czekamy na załadowanie nowego klipu, zanim zegar i tak ruszy [s]. */
const LOAD_WAIT = 2

/** Obwiednia beatu z BeatDetector ma 1 dokładnie w klatce uderzenia. */
export function beatTriggered(beat: number): boolean {
  return beat >= 0.99
}

export interface SequencerItem {
  id: string
  duration: number
  waitBeat: boolean
}

export class Sequencer {
  private itemId: string | null = null
  private elapsed = 0
  private done = false
  private waited = 0

  /**
   * Raz na klatkę; true = tnij teraz (raz na element). Bez alokacji.
   * `ready` = nowy klip już gra; do tego czasu (najwyżej LOAD_WAIT) zegar stoi.
   */
  step(dt: number, beat: boolean, item: SequencerItem | null, ready = true): boolean {
    if (!item) {
      this.itemId = null
      return false
    }
    if (item.id !== this.itemId) {
      this.itemId = item.id
      this.elapsed = 0
      this.waited = 0
      this.done = false
    }
    if (this.done) return false
    if (!ready && this.waited < LOAD_WAIT) {
      this.waited += Math.max(dt, 0)
      return false
    }
    this.elapsed += Math.max(dt, 0)
    const due = this.elapsed >= item.duration - EPS
    const cut = item.waitBeat
      ? due && (beat || this.elapsed >= item.duration + TIMELINE_LIMITS.beatGrace - EPS)
      : due
    if (cut) this.done = true
    return cut
  }
}

/**
 * Pętla fragmentu: dokąd przewinąć wideo (s) albo null. Koniec fragmentu to
 * `outPoint`, ale nie dalej niż koniec pliku; `inPoint` poza plikiem = 0.
 * Wywoływane co klatkę – bez alokacji.
 */
export function loopTarget(
  time: number,
  fileDuration: number,
  inPoint: number,
  outPoint: number | null
): number | null {
  const known = Number.isFinite(fileDuration) && fileDuration > 0
  const start = known && inPoint >= fileDuration ? 0 : inPoint
  let end = outPoint ?? Infinity
  if (known && fileDuration < end) end = fileDuration
  if (time >= end - 1 / 120 || time < start - 0.25) return start
  return null
}

/**
 * Klip do odtwarzania. Gdy kolejka gra albo ujęcie jest edytowane (linked), wygrywa
 * klip bieżącego elementu;
 * inaczej stały plik z node'a źródła (jeśli jest w bibliotece) albo aktywne wideo.
 */
export function pickVideoId(state: AppState, sourceFixedId: string | null): string | null {
  const has = (id: string | null): id is string =>
    id !== null && state.library.some((v) => v.id === id)
  const t = state.timeline
  const item = t.playing || t.linked ? t.items[t.index] : undefined
  if (item && has(item.videoId)) return item.videoId
  return has(sourceFixedId) ? sourceFixedId : state.activeId
}
