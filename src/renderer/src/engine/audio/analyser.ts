// Analiza FFT: pasma bass/mid/high, głośność i beat. Bufory tworzone raz,
// w klatce tylko aktualizowane.

import type { AudioLevels } from '@shared/types'
import { BeatDetector } from './beat'

export const BANDS = {
  bass: [20, 150],
  mid: [150, 2000],
  high: [2000, 12000]
} as const

/** Zakres binów FFT dla pasma [lo, hi] Hz. */
export function binRange(
  lo: number,
  hi: number,
  sampleRate: number,
  fftSize: number
): [number, number] {
  const hzPerBin = sampleRate / fftSize
  const last = fftSize / 2 - 1
  const from = Math.min(last, Math.max(1, Math.floor(lo / hzPerBin)))
  const to = Math.min(last, Math.max(from, Math.ceil(hi / hzPerBin)))
  return [from, to]
}

/** Średnia wartość binów [from, to] znormalizowana do 0..1. */
export function bandAverage(data: ArrayLike<number>, from: number, to: number): number {
  let sum = 0
  for (let i = from; i <= to; i++) sum += data[i]
  return sum / ((to - from + 1) * 255)
}

/** Wygładzanie: szybki atak, wolniejsze opadanie. */
export function follow(prev: number, target: number, attack: number, release: number): number {
  return prev + (target - prev) * (target > prev ? attack : release)
}

export function rms(data: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
  return Math.sqrt(sum / data.length)
}

export class AudioAnalyser {
  readonly levels: AudioLevels = { bass: 0, mid: 0, high: 0, level: 0, beat: 0 }
  private readonly freq: Uint8Array<ArrayBuffer>
  private readonly time: Float32Array<ArrayBuffer>
  private readonly ranges: Record<keyof typeof BANDS, [number, number]>
  private readonly beat = new BeatDetector()

  constructor(private readonly node: AnalyserNode) {
    node.fftSize = 2048
    node.smoothingTimeConstant = 0.5
    node.minDecibels = -90
    node.maxDecibels = -20
    this.freq = new Uint8Array(node.frequencyBinCount)
    this.time = new Float32Array(node.fftSize)
    const sr = node.context.sampleRate
    this.ranges = {
      bass: binRange(BANDS.bass[0], BANDS.bass[1], sr, node.fftSize),
      mid: binRange(BANDS.mid[0], BANDS.mid[1], sr, node.fftSize),
      high: binRange(BANDS.high[0], BANDS.high[1], sr, node.fftSize)
    }
  }

  update(now: number): AudioLevels {
    this.node.getByteFrequencyData(this.freq)
    this.node.getFloatTimeDomainData(this.time)
    const l = this.levels
    const bass = bandAverage(this.freq, ...this.ranges.bass)
    l.bass = follow(l.bass, bass, 0.7, 0.2)
    l.mid = follow(l.mid, bandAverage(this.freq, ...this.ranges.mid), 0.6, 0.2)
    l.high = follow(l.high, bandAverage(this.freq, ...this.ranges.high), 0.6, 0.2)
    l.level = follow(l.level, Math.min(1, rms(this.time) * 2.5), 0.6, 0.15)
    l.beat = this.beat.update(bass, now)
    return l
  }
}
