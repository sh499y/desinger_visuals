import { describe, expect, it } from 'vitest'
import {
  FILTER_TYPES,
  NODE_DEFS,
  NODE_TYPES,
  clamp,
  defaultParams,
  findNumberParam,
  findParam,
  isNodeType
} from './nodes'

describe('definicje node’ów', () => {
  it.each(NODE_TYPES)('%s: spójna definicja', (type) => {
    const def = NODE_DEFS[type]
    expect(def.type).toBe(type)
    expect(def.label).toBeTruthy()

    const keys = def.params.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
    // Nazwy portów nie mogą się zderzać z parametrami (kable trafiają w "node.klucz").
    for (const port of [...def.signalIn, ...def.signalOut, 'input', 'video']) {
      expect(keys).not.toContain(port)
    }

    for (const p of def.params) {
      if (p.kind === 'number') {
        expect(p.min).toBeLessThan(p.max)
        expect(p.step).toBeGreaterThan(0)
        expect(p.default).toBeGreaterThanOrEqual(p.min)
        expect(p.default).toBeLessThanOrEqual(p.max)
      }
      if (p.kind === 'select') {
        expect(p.options.map((o) => o.value)).toContain(p.default)
      }
    }
  })

  it('kategorie zgadzają się z portami obrazu', () => {
    for (const type of NODE_TYPES) {
      const def = NODE_DEFS[type]
      if (def.category === 'filter') expect([def.videoIn, def.videoOut]).toEqual([true, true])
      if (def.category === 'source') expect([def.videoIn, def.videoOut]).toEqual([false, true])
      if (def.category === 'output') expect([def.videoIn, def.videoOut]).toEqual([true, false])
      if (def.category === 'control') {
        expect([def.videoIn, def.videoOut]).toEqual([false, false])
        expect(def.signalOut.length).toBeGreaterThan(0)
      }
    }
  })

  it('jest dokładnie jedno wyjście i co najmniej jedno źródło', () => {
    expect(NODE_TYPES.filter((t) => NODE_DEFS[t].category === 'output')).toEqual(['Output'])
    expect(NODE_TYPES.some((t) => NODE_DEFS[t].category === 'source')).toBe(true)
  })

  it('FILTER_TYPES zawiera wszystkie filtry z planu', () => {
    expect(FILTER_TYPES).toEqual(
      expect.arrayContaining([
        'BrightnessContrast',
        'HueSaturation',
        'Bloom',
        'RGBSplit',
        'Pixelate',
        'Glitch',
        'Noise',
        'Vignette'
      ])
    )
  })
})

describe('funkcje pomocnicze', () => {
  it('isNodeType', () => {
    expect(isNodeType('Bloom')).toBe(true)
    expect(isNodeType('toString')).toBe(false)
    expect(isNodeType(1)).toBe(false)
  })

  it('findParam / findNumberParam', () => {
    expect(findParam('VideoFile', 'loop')?.kind).toBe('boolean')
    expect(findNumberParam('VideoFile', 'loop')).toBeUndefined()
    expect(findNumberParam('Bloom', 'intensity')?.max).toBe(10)
    expect(findParam('Bloom', 'nope')).toBeUndefined()
  })

  it('defaultParams', () => {
    expect(defaultParams('VideoFile')).toEqual({ videoId: null, loop: true, speed: 1 })
    expect(defaultParams('Output')).toEqual({ resolution: 1 })
  })

  it('clamp', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})
