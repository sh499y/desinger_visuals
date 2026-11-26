import { describe, expect, it } from 'vitest'
import type { Graph } from '@shared/types'
import { lineVar, portColor, signalColor, termVar, textVar } from './palette'

const graph: Graph = {
  version: 1,
  nodes: [
    { id: 'a1', type: 'AudioIn', params: {} },
    { id: 'l1', type: 'LFO', params: {} },
    { id: 'm1', type: 'Math', params: {} }
  ],
  edges: []
}

describe('portColor', () => {
  it('wyjścia AudioIn mają kolory pasm, nieznany port jest biały', () => {
    expect(portColor('AudioIn', 'bass')).toBe('red')
    expect(portColor('AudioIn', 'beat')).toBe('magenta')
    expect(portColor('AudioIn', 'nope')).toBe('white')
  })

  it('wyjścia MPC są zielone', () => {
    expect(portColor('MPC', 'hit')).toBe('green')
    expect(portColor('MPC', 'last')).toBe('green')
  })

  it('LFO, Math i brak typu dają niebieski', () => {
    expect(portColor('LFO', 'value')).toBe('blue')
    expect(portColor('Math', 'out')).toBe('blue')
    expect(portColor(undefined, 'out')).toBe('blue')
  })
})

describe('signalColor', () => {
  it('pasma audio mają swoje kolory', () => {
    expect(signalColor(graph, 'a1.bass')).toBe('red')
    expect(signalColor(graph, 'a1.mid')).toBe('yellow')
    expect(signalColor(graph, 'a1.high')).toBe('cyan')
    expect(signalColor(graph, 'a1.level')).toBe('white')
    expect(signalColor(graph, 'a1.beat')).toBe('magenta')
  })

  it('LFO, Math i nieznane źródła są niebieskie', () => {
    expect(signalColor(graph, 'l1.value')).toBe('blue')
    expect(signalColor(graph, 'm1.out')).toBe('blue')
    expect(signalColor(graph, 'x9.out')).toBe('blue')
  })
})

describe('zmienne CSS', () => {
  it('termVar zwraca zmienną CSS', () => {
    expect(termVar('red')).toBe('var(--color-term-red)')
  })

  it('textVar daje kolory czytelne dla małego tekstu', () => {
    expect(textVar('blue')).toBe('var(--color-term-white)')
    expect(textVar('red')).toBe('var(--color-term-bright-red)')
    expect(textVar('magenta')).toBe('var(--color-term-bright-magenta)')
    expect(textVar('cyan')).toBe('var(--color-term-cyan)')
  })

  it('lineVar rozjaśnia tylko niebieski', () => {
    expect(lineVar('blue')).toBe('var(--color-term-bright-blue)')
    expect(lineVar('red')).toBe('var(--color-term-red)')
  })
})
