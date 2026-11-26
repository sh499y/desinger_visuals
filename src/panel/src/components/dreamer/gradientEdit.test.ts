import { describe, expect, it } from 'vitest'
import { parseGradient, presetValue, type GradientStop } from '@shared/gradient'
import { addStop, cssGradient, moveStop, removeStop, toggleHard } from './gradientEdit'

const stops = (name: string): GradientStop[] => parseGradient(presetValue(name))!

describe('gradientEdit', () => {
  it('nowy stop bierze kolor gradientu w swoim miejscu', () => {
    const out = addStop(stops('Mono'), 0.5)
    expect(out).toHaveLength(3)
    expect(out[1]).toEqual({ pos: 0.5, color: '#808080', hard: false })
  })

  it('nie usuwa poniżej dwóch stopów', () => {
    const two = stops('Mono')
    expect(removeStop(two, 0)).toBe(two)
    expect(removeStop(stops('Heat'), 0)).toHaveLength(4)
  })

  it('przesunięcie za sąsiada zmienia kolejność i trzyma zakres 0..1', () => {
    const out = moveStop(stops('Mono'), 0, 1.5)
    expect(out.map((s) => s.pos)).toEqual([1, 1])
    const heat = moveStop(stops('Heat'), 1, 0.9)
    expect(heat.map((s) => s.pos)).toEqual([0, 0.45, 0.7, 0.9, 1])
  })

  it('przełącza twardy stop', () => {
    expect(toggleHard(stops('Mono'), 0)[0].hard).toBe(true)
  })

  it('CSS: twardy stop to dwie pozycje w tym samym miejscu', () => {
    expect(cssGradient(stops('Duotone'))).toContain('#101830 50%, #e0c090 50%')
    expect(cssGradient(stops('Mono'))).toBe('linear-gradient(90deg, #000000 0%, #ffffff 100%)')
  })
})
