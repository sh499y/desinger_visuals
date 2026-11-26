import { describe, expect, it } from 'vitest'
import {
  GRADIENT_MAX_LEN,
  GRADIENT_PRESETS,
  encodeGradient,
  parseGradient,
  presetValue,
  sampleGradient
} from './gradient'

const sample = (value: string, t: number): number[] => {
  const out = new Float32Array(3)
  sampleGradient(parseGradient(value)!, t, out)
  return Array.from(out)
}
const close = (a: number[], b: number[]): void => {
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5))
}
const hex = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)

describe('gradient', () => {
  it('presety przechodzą przez parse → encode bez zmian', () => {
    expect(GRADIENT_PRESETS).toHaveLength(10)
    for (const p of GRADIENT_PRESETS) expect(encodeGradient(parseGradient(p.value)!)).toBe(p.value)
  })

  it('odrzuca uszkodzone napisy', () => {
    const many = Array.from({ length: 17 }, (_, i) => `${i / 16}:000000`).join(';')
    for (const bad of ['zzz', '', many, '0:12345g', 'NaN:000000', '2:000000', '0:000000:x'])
      expect(parseGradient(bad)).toBeNull()
    expect(GRADIENT_MAX_LEN).toBe(400)
  })

  it('Mono: środek szary, poza zakresem końce', () => {
    const mono = presetValue('Mono')
    close(sample(mono, 0.5), [0.5, 0.5, 0.5])
    close(sample(mono, -1), [0, 0, 0])
    close(sample(mono, 2), [1, 1, 1])
  })

  it('twardy stop przeskakuje bez przejścia', () => {
    const duo = presetValue('Duotone')
    close(sample(duo, 0.4999), hex('#101830'))
    close(sample(duo, 0.5), hex('#e0c090'))
  })

  it('jeden stop i stopy w tym samym miejscu nie dają NaN', () => {
    close(sample('0.3:ff0000', 0), [1, 0, 0])
    close(sample('0.3:ff0000', 1), [1, 0, 0])
    for (const v of sample('0.5:000000;0.5:ffffff', 0.5)) expect(Number.isNaN(v)).toBe(false)
  })

  it('sortuje stopy po pozycji', () => {
    expect(encodeGradient(parseGradient('1:ffffff;0:000000')!)).toBe('0:000000;1:ffffff')
  })
})
