import { describe, expect, it } from 'vitest'
import { AudioAnalyser, BANDS, binRange } from './analyser'

/** Udawany AnalyserNode: widmo i przebieg ustawiane przez test. */
function fakeNode(sampleRate = 48000): AnalyserNode & {
  spectrum: (fn: (hz: number) => number) => void
  wave: (fn: (i: number) => number) => void
} {
  let freq = (_hz: number): number => 0
  let time = (_i: number): number => 0
  const node = {
    fftSize: 2048,
    smoothingTimeConstant: 0,
    minDecibels: 0,
    maxDecibels: 0,
    get frequencyBinCount() {
      return node.fftSize / 2
    },
    context: { sampleRate },
    getByteFrequencyData(out: Uint8Array) {
      for (let i = 0; i < out.length; i++) out[i] = freq((i * sampleRate) / node.fftSize)
    },
    getFloatTimeDomainData(out: Float32Array) {
      for (let i = 0; i < out.length; i++) out[i] = time(i)
    },
    spectrum(fn: (hz: number) => number) {
      freq = fn
    },
    wave(fn: (i: number) => number) {
      time = fn
    }
  }
  return node as never
}

const run = (a: AudioAnalyser, frames: number, start = 0): number => {
  let t = start
  for (let i = 0; i < frames; i++) a.update((t += 1000 / 60))
  return t
}

describe('AudioAnalyser', () => {
  it('ustawia parametry AnalyserNode', () => {
    const node = fakeNode()
    new AudioAnalyser(node)
    expect(node).toMatchObject({ fftSize: 2048, minDecibels: -90, maxDecibels: -20 })
  })

  it('cisza daje zera', () => {
    const a = new AudioAnalyser(fakeNode())
    run(a, 30)
    expect(a.levels).toEqual({ bass: 0, mid: 0, high: 0, level: 0, beat: 0 })
  })

  it('rozdziela pasma: sam bas podnosi tylko bass', () => {
    const node = fakeNode()
    node.spectrum((hz) => (hz >= BANDS.bass[0] && hz < BANDS.bass[1] ? 255 : 0))
    const a = new AudioAnalyser(node)
    run(a, 30)
    expect(a.levels.bass).toBeGreaterThan(0.8)
    expect(a.levels.mid).toBeLessThan(0.05)
    expect(a.levels.high).toBe(0)
  })

  it('wysokie tony podnoszą tylko high', () => {
    const node = fakeNode()
    node.spectrum((hz) => (hz >= 3000 && hz <= 11000 ? 255 : 0))
    const a = new AudioAnalyser(node)
    run(a, 30)
    expect(a.levels.high).toBeGreaterThan(0.5)
    expect(a.levels.bass).toBe(0)
  })

  it('level rośnie z głośnością przebiegu', () => {
    const node = fakeNode()
    node.wave((i) => 0.3 * Math.sin(i / 5))
    const a = new AudioAnalyser(node)
    run(a, 30)
    expect(a.levels.level).toBeGreaterThan(0.4)
    expect(a.levels.level).toBeLessThanOrEqual(1)
  })

  it('uderzenie basu po ciszy daje beat', () => {
    const node = fakeNode()
    node.spectrum((hz) => (hz < 150 ? 60 : 0))
    const a = new AudioAnalyser(node)
    const t = run(a, 60)
    node.spectrum((hz) => (hz < 150 ? 255 : 0))
    a.update(t + 16)
    expect(a.levels.beat).toBe(1)
  })

  it('poziomy wygładzone: opadają wolniej niż rosną', () => {
    const node = fakeNode()
    node.spectrum((hz) => (hz < 150 ? 255 : 0))
    const a = new AudioAnalyser(node)
    a.update(16)
    const up = a.levels.bass
    run(a, 30)
    const steady = a.levels.bass
    node.spectrum(() => 0)
    a.update(1000)
    const down = a.levels.bass
    // Atak 0,7: po jednej klatce 70% poziomu; opadanie 0,2: po jednej klatce zostaje 80%.
    expect(up / steady).toBeCloseTo(0.7)
    expect(down / steady).toBeCloseTo(0.8)
  })

  it('binRange dla innej częstotliwości próbkowania', () => {
    expect(binRange(20, 150, 44100, 2048)).toEqual([1, 7])
    const [from, to] = binRange(2000, 12000, 44100, 2048)
    expect(to).toBeLessThanOrEqual(1023)
    expect(from).toBeLessThan(to)
  })
})
