import { describe, expect, it } from 'vitest'
import { connect, defaultGraph, updateNode } from '@shared/graph'
import { defaultParams } from '@shared/nodes'
import type { Graph, GraphNode } from '@shared/types'
import { SignalBus, compileGraph, lfoShape } from './graph'

const audio = { bass: 0.5, mid: 0.2, high: 0.1, level: 0.3, beat: 1 }
const nodesOf = (g: Graph): Map<string, GraphNode> => new Map(g.nodes.map((n) => [n.id, n]))

function bus(g: Graph): SignalBus {
  const b = new SignalBus(compileGraph(g), nodesOf(g))
  b.evaluate(audio, 1 / 60)
  return b
}

describe('compileGraph', () => {
  it('pomija wyłączone filtry i zmienia chainKey', () => {
    const g = defaultGraph()
    const a = compileGraph(g)
    const b = compileGraph(updateNode(g, 'bloom1', { bypass: true }))
    expect(a.filterIds).toContain('bloom1')
    expect(b.filterIds).not.toContain('bloom1')
    expect(a.chainKey).not.toBe(b.chainKey)
  })
})

describe('SignalBus', () => {
  it('kabel audio → parametr: bass × scale + offset', () => {
    // defaultGraph: a1.bass → bloom1.intensity, scale 4, offset 0.5
    expect(bus(defaultGraph()).number('bloom1', 'intensity')).toBeCloseTo(0.5 * 4 + 0.5)
  })

  it('bez kabla zwraca wartość suwaka', () => {
    expect(bus(defaultGraph()).number('vignette1', 'darkness')).toBe(0.6)
  })

  it('gain AudioIn wzmacnia pasma, ale nie beat', () => {
    const g = updateNode(defaultGraph(), 'a1', { params: { gain: 2 } })
    const b = bus(g)
    expect(b.values.get('a1.bass')).toBe(1)
    expect(b.values.get('a1.mid')).toBeCloseTo(0.4)
    expect(b.values.get('a1.beat')).toBe(1)
  })

  it('Math przelicza sygnał w łańcuchu sterowania', () => {
    let g = defaultGraph()
    g = {
      ...g,
      nodes: [
        ...g.nodes,
        { id: 'm1', type: 'Math', params: { ...defaultParams('Math'), scale: 2, max: 5 } }
      ]
    }
    g = connect(g, { from: 'a1.mid', to: 'm1.in' })
    g = connect(g, { from: 'm1.out', to: 'vignette1.darkness' })
    const b = bus(g)
    expect(b.values.get('m1.out')).toBeCloseTo(0.4)
    expect(b.number('vignette1', 'darkness')).toBeCloseTo(0.4)
  })
})

describe('lfoShape', () => {
  it('kształty w zakresie 0..1', () => {
    expect(lfoShape(0, 0)).toBe(0)
    expect(lfoShape(0, 0.5)).toBe(1)
    expect(lfoShape(1, 0.5)).toBe(1)
    expect(lfoShape(2, 0.25)).toBe(0.25)
    expect(lfoShape(3, 0.75)).toBe(0)
  })
})

describe('SignalBus – LFO, Math i wartości domyślne', () => {
  const withNodes = (...nodes: GraphNode[]): Graph => {
    const g = defaultGraph()
    return { ...g, nodes: [...g.nodes, ...nodes] }
  }

  it('LFO przesuwa fazę z czasem i podaje wartość na kabel', () => {
    let g = withNodes({ id: 'lfo1', type: 'LFO', params: { rate: 1, shape: 2 } })
    g = connect(g, { from: 'lfo1.value', to: 'vignette1.darkness' })
    const b = new SignalBus(compileGraph(g), nodesOf(g))
    b.evaluate(audio, 0.25)
    expect(b.values.get('lfo1.value')).toBeCloseTo(0.25) // piła: wartość = faza
    b.evaluate(audio, 0.5)
    expect(b.values.get('lfo1.value')).toBeCloseTo(0.75)
    b.evaluate(audio, 0.5)
    expect(b.values.get('lfo1.value')).toBeCloseTo(0.25) // faza zawija się po 1
    expect(b.number('vignette1', 'darkness')).toBeCloseTo(0.25)
  })

  it('LFO z kablem na częstotliwość (rate sterowane audio)', () => {
    let g = withNodes({ id: 'lfo1', type: 'LFO', params: { rate: 0.01, shape: 2 } })
    g = connect(g, { from: 'a1.beat', to: 'lfo1.rate', scale: 2 })
    const b = new SignalBus(compileGraph(g), nodesOf(g))
    b.evaluate(audio, 0.1) // beat = 1 → rate = 2 Hz
    expect(b.values.get('lfo1.value')).toBeCloseTo(0.2)
  })

  it('Math bez wejścia liczy z zera, a odwrócone min/max nie psują wyniku', () => {
    const g = withNodes({
      id: 'm1',
      type: 'Math',
      params: { ...defaultParams('Math'), offset: 0.7, min: 1, max: 0 }
    })
    expect(bus(g).values.get('m1.out')).toBeCloseTo(0.7)
  })

  it('number: brak wartości → domyślna z definicji, nieznany node → 0', () => {
    const g = updateNode(defaultGraph(), 'bloom1', { params: {} })
    const b = bus(g)
    expect(b.number('bloom1', 'threshold')).toBe(0.4)
    expect(b.number('ghost', 'x')).toBe(0)
  })

  it('setGraph podmienia graf bez gubienia fazy LFO', () => {
    const g = withNodes({ id: 'lfo1', type: 'LFO', params: { rate: 1, shape: 2 } })
    const b = new SignalBus(compileGraph(g), nodesOf(g))
    b.evaluate(audio, 0.3)
    b.setGraph(compileGraph(g), nodesOf(g))
    b.evaluate(audio, 0.3)
    expect(b.values.get('lfo1.value')).toBeCloseTo(0.6)
  })

  it('compileGraph: źródło, wyjście i kolejność sterowania', () => {
    const c = compileGraph(withNodes({ id: 'lfo1', type: 'LFO', params: {} }))
    expect(c.sourceId).toBe('v1')
    expect(c.outputId).toBe('out')
    expect(c.controlIds).toEqual(['a1', 'lfo1'])
    expect([...c.bindings.keys()]).toEqual(['bloom1.intensity', 'rgbsplit1.amount'])
  })
})
