import { describe, expect, it } from 'vitest'
import { bandAverage, binRange, follow, rms } from './analyser'
import { BeatDetector } from './beat'

describe('BeatDetector', () => {
  const frame = 1000 / 60

  it('nie daje beatów przy stałej energii', () => {
    const d = new BeatDetector()
    let beats = 0
    for (let i = 0; i < 120; i++) {
      d.update(0.4, i * frame)
      if (d.triggered) beats++
    }
    expect(beats).toBe(0)
  })

  it('wykrywa skok energii i respektuje cooldown', () => {
    const d = new BeatDetector({ cooldownMs: 200 })
    let t = 0
    for (let i = 0; i < 60; i++, t += frame) d.update(0.3, t)
    expect(d.update(0.9, t)).toBe(1)
    expect(d.triggered).toBe(true)
    t += frame
    d.update(0.9, t)
    expect(d.triggered).toBe(false)
  })

  it('obwiednia zanika po beacie', () => {
    const d = new BeatDetector({ decayPerSecond: 5 })
    let t = 0
    for (let i = 0; i < 60; i++, t += frame) d.update(0.3, t)
    d.update(0.9, t)
    let env = 1
    for (let i = 0; i < 12; i++) env = d.update(0.3, (t += frame))
    expect(env).toBeLessThan(0.5)
    expect(env).toBeGreaterThan(0)
  })

  it('cisza nie daje beatów', () => {
    const d = new BeatDetector()
    let t = 0
    for (let i = 0; i < 60; i++, t += frame) d.update(0, t)
    d.update(0.1, t)
    expect(d.triggered).toBe(false)
  })
})

describe('analiza pasm', () => {
  it('binRange liczy biny dla 48 kHz / 2048', () => {
    const [from, to] = binRange(20, 150, 48000, 2048)
    expect(from).toBe(1)
    expect(to).toBe(7)
  })

  it('bandAverage normalizuje do 0..1', () => {
    const data = new Uint8Array([0, 255, 255, 0])
    expect(bandAverage(data, 1, 2)).toBe(1)
    expect(bandAverage(data, 0, 3)).toBe(0.5)
  })

  it('follow ma szybki atak i wolne opadanie', () => {
    expect(follow(0, 1, 0.5, 0.1)).toBe(0.5)
    expect(follow(1, 0, 0.5, 0.1)).toBeCloseTo(0.9)
  })

  it('rms sinusa ≈ 0,707', () => {
    const s = Float32Array.from({ length: 1000 }, (_, i) => Math.sin((i / 1000) * Math.PI * 20))
    expect(rms(s)).toBeCloseTo(Math.SQRT1_2, 2)
  })
})
