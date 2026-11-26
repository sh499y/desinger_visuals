import { describe, expect, it } from 'vitest'
import {
  GAUSS_MAX,
  GrainClock,
  blurUniforms,
  emptyBlur,
  focusGeom,
  gaussLevel,
  grainCell,
  toneWeight,
  type DreamerBlurParams
} from './model'

const params = (over: Partial<DreamerBlurParams> = {}): DreamerBlurParams => ({
  amount: 100,
  angle: 0,
  centerX: 0.5,
  centerY: 0.5,
  focus: 0.3,
  feather: 0.5,
  ...over
})

describe('blurUniforms', () => {
  it('Siła 0 nic nie rozmywa, 100 daje pełne σ', () => {
    const out = emptyBlur()
    blurUniforms(0, params({ amount: 0 }), 1920, 1080, out)
    expect(out.sigma).toBe(0)
    expect(out.len).toBe(0)
    blurUniforms(0, params(), 1920, 1080, out)
    expect(out.sigma).toBeCloseTo(GAUSS_MAX * 1920)
  })

  it('rozmiar zależy od dłuższego boku, nie od orientacji', () => {
    const a = emptyBlur()
    const b = emptyBlur()
    blurUniforms(1, params(), 1920, 1080, a)
    blurUniforms(1, params(), 1080, 1920, b)
    expect(a.len).toBeCloseTo(b.len)
  })

  it('zły rodzaj trafia w zakres', () => {
    const out = emptyBlur()
    blurUniforms(99, params(), 100, 100, out)
    expect(out.kind).toBe(5)
    blurUniforms(NaN, params(), 100, 100, out)
    expect(out.kind).toBe(0)
  })
})

describe('focusGeom', () => {
  it('pasmo ostrości jest węższe niż pasmo pełnego rozmycia', () => {
    const g = focusGeom(params(), 1000, 500, emptyBlur().geom)
    expect(g.cx).toBe(500)
    expect(g.cy).toBe(250)
    expect(g.bandOuter).toBeGreaterThan(g.bandHalf)
    expect(g.outer).toBeGreaterThan(1)
    expect(g.rx).toBeGreaterThan(g.ry)
  })

  it('zerowy obszar ostrości nie daje zerowych osi', () => {
    const g = focusGeom(params({ focus: 0 }), 1000, 500, emptyBlur().geom)
    expect(g.rx).toBeGreaterThanOrEqual(1)
    expect(g.ry).toBeGreaterThanOrEqual(1)
  })
})

describe('gaussLevel i grainCell', () => {
  it('większe σ schodzi na mniejszy poziom piramidy', () => {
    expect(gaussLevel(1)).toBe(0)
    expect(gaussLevel(60)).toBeGreaterThan(gaussLevel(10))
  })

  it('Rozmiar 100 to dziesięć razy większa komórka', () => {
    expect(grainCell(100, 1920) / grainCell(0, 1920)).toBeCloseTo(10)
  })
})

describe('toneWeight', () => {
  it('100 / 100 nie zmienia, 0 w cieniach gasi czerń', () => {
    for (const l of [0, 0.25, 0.75, 1]) expect(toneWeight(l, 100, 100)).toBeCloseTo(1)
    expect(toneWeight(0, 0, 100)).toBe(0)
    expect(toneWeight(1, 100, 200)).toBeGreaterThan(1)
  })
})

describe('GrainClock', () => {
  it('Ruch 0: wzór stoi', () => {
    const c = new GrainClock()
    const first = c.tick(1 / 60, 0)
    for (let i = 0; i < 100; i++) expect(c.tick(1 / 60, 0)).toBe(first)
  })

  it('Ruch 1: nowy wzór co klatkę', () => {
    const c = new GrainClock()
    let prev = c.tick(1 / 60, 1)
    for (let i = 0; i < 100; i++) {
      const s = c.tick(1 / 60, 1)
      expect(s).not.toBe(prev)
      prev = s
    }
  })

  it('Ruch 1 przy 120 Hz i nierównych klatkach też zmienia co klatkę', () => {
    const c = new GrainClock()
    let prev = c.tick(1 / 120, 1)
    for (const dt of [1 / 120, 1 / 120, 0.005, 1 / 120, 0.012]) {
      const s = c.tick(dt, 1)
      expect(s).not.toBe(prev)
      prev = s
    }
  })

  it('mniejszy ruch zmienia wzór rzadziej', () => {
    const count = (motion: number): number => {
      const c = new GrainClock()
      let n = 0
      let prev = c.tick(0, motion)
      for (let i = 0; i < 600; i++) {
        const s = c.tick(1 / 60, motion)
        if (s !== prev) n++
        prev = s
      }
      return n
    }
    expect(count(0.3)).toBeLessThan(count(0.7))
    expect(count(0.7)).toBeLessThan(count(1))
  })
})
