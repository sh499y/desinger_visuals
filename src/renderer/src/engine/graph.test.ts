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
