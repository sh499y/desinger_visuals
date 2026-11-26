import { describe, expect, it } from 'vitest'
import { connect, defaultGraph, updateNode } from '@shared/graph'
import { defaultParams } from '@shared/nodes'
import type { Graph, GraphNode } from '@shared/types'
import { SignalBus, compileGraph, lfoShape, smoothStep } from './graph'
import { MidiState } from './midi/state'

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

describe('smoothStep', () => {
  it('atak i zwolnienie to stałe czasowe w ms', () => {
    expect(smoothStep(0, 1, 0.03, 30, 400)).toBeCloseTo(1 - Math.exp(-1), 6)
    expect(smoothStep(1, 0, 0.4, 30, 400)).toBeCloseTo(Math.exp(-1), 6)
  })

  it('0 ms przepuszcza, dt 0 stoi, długie dt nie przestrzeliwuje', () => {
    expect(smoothStep(0.2, 0.9, 1 / 60, 0, 400)).toBe(0.9)
    expect(smoothStep(0.2, 0.9, 0, 30, 400)).toBe(0.2)
    const v = smoothStep(0.2, 0.9, 0.1, 1, 400)
    expect(v).toBeLessThanOrEqual(0.9)
    expect(v).toBeCloseTo(0.9, 6)
    for (const dt of [0, 1e-4, 1 / 60, 0.1, 5]) {
      const w = smoothStep(0.9, 0.2, dt, 30, 400)
      expect(w).toBeGreaterThanOrEqual(0.2)
      expect(w).toBeLessThanOrEqual(0.9)
    }
  })
})

describe('SignalBus – Wygładzanie', () => {
  it('stały sygnał narasta płynnie od 0 do wejścia', () => {
    const base = defaultGraph()
    let g: Graph = {
      ...base,
      nodes: [...base.nodes, { id: 's1', type: 'Smooth', params: defaultParams('Smooth') }]
    }
    g = connect(g, { from: 'a1.level', to: 's1.in' })
    const b = new SignalBus(compileGraph(g), nodesOf(g))
    const full = { ...audio, level: 1 }
    const seen: number[] = []
    for (let i = 0; i < 60; i++) {
      b.evaluate(full, 1 / 60)
      seen.push(b.values.get('s1.out')!)
    }
    expect(seen[0]).toBeGreaterThan(0)
    expect(seen[0]).toBeLessThan(1)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
    expect(seen[59]).toBeCloseTo(1, 3)
  })
})

describe('SignalBus – MPC', () => {
  const mpc = (id: string, params: Record<string, number> = {}): GraphNode => ({
    id,
    type: 'MPC',
    params: { ...defaultParams('MPC'), ...params }
  })
  const withNodes = (...nodes: GraphNode[]): Graph => {
    const g = defaultGraph()
    return { ...g, nodes: [...g.nodes, ...nodes] }
  }
  const setup = (...nodes: GraphNode[]): { b: SignalBus; midi: MidiState; g: Graph } => {
    const g = withNodes(...nodes)
    const b = new SignalBus(compileGraph(g), nodesOf(g))
    const midi = new MidiState()
    b.evaluate(audio, 1 / 60, midi)
    return { b, midi, g }
  }

  it('bez MIDI daje zera', () => {
    const g = withNodes(mpc('p1'))
    const b = new SignalBus(compileGraph(g), nodesOf(g))
    b.evaluate(audio, 1 / 60)
    expect(b.values.get('p1.hit')).toBe(0)
    expect(b.values.get('p1.held')).toBe(0)
    expect(b.values.get('p1.last')).toBe(0)
  })

  it('uderzenie daje hit, held i numer padu', () => {
    const { b, midi } = setup(mpc('p1'))
    midi.handle([0x90, 36, 127])
    b.evaluate(audio, 1 / 60, midi)
    expect(b.values.get('p1.hit')).toBeCloseTo(1)
    expect(b.values.get('p1.held')).toBeCloseTo(1)
    expect(b.values.get('p1.last')).toBe(0)
  })

  it('hit wygasa do ok. 1% po czasie decay', () => {
    const { b, midi } = setup(mpc('p1', { decay: 0.4 }))
    midi.handle([0x90, 36, 127])
    b.evaluate(audio, 0, midi)
    b.evaluate(audio, 0.4, midi)
    const hit = b.values.get('p1.hit') ?? -1
    expect(hit).toBeGreaterThan(0)
    expect(hit).toBeLessThan(0.011)
  })

  it('gain wzmacnia hit z obcięciem do 1', () => {
    const { b, midi } = setup(mpc('p1', { gain: 2 }))
    midi.handle([0x90, 36, 64])
    b.evaluate(audio, 0, midi)
    expect(b.values.get('p1.hit')).toBeCloseTo(Math.min(1, (2 * 64) / 127))
  })

  it('node z wybranym padem reaguje tylko na swój pad', () => {
    const { b, midi } = setup(mpc('a', { pad: 1 }), mpc('b', { pad: 2 }))
    midi.handle([0x90, 37, 100])
    b.evaluate(audio, 1 / 60, midi)
    expect(b.values.get('a.hit')).toBe(0)
    expect(b.values.get('a.held')).toBe(0)
    expect(b.values.get('b.hit')).toBeGreaterThan(0)
  })

  it('tryb „wszystkie” podaje ostatni pad', () => {
    const { b, midi } = setup(mpc('p1'))
    midi.handle([0x90, 51, 100])
    b.evaluate(audio, 1 / 60, midi)
    expect(b.values.get('p1.last')).toBeCloseTo(1)
    expect(b.values.get('p1.hit')).toBeGreaterThan(0)
  })

  it('uderzenie sprzed dodania node’a nie odpala hit', () => {
    const g = withNodes(mpc('p1'))
    const midi = new MidiState()
    midi.handle([0x90, 36, 127])
    midi.handle([0x80, 36, 0])
    const b = new SignalBus(compileGraph(g), nodesOf(g))
    b.evaluate(audio, 1 / 60, midi)
    expect(b.values.get('p1.hit')).toBe(0)
  })

  it('node usunięty i dodany z tym samym id nie odpala starego uderzenia', () => {
    const { b, midi, g } = setup(mpc('p1'))
    const without = { ...g, nodes: g.nodes.filter((n) => n.id !== 'p1') }
    b.setGraph(compileGraph(without), nodesOf(without))
    b.evaluate(audio, 1 / 60, midi)
    midi.handle([0x90, 36, 127])
    b.setGraph(compileGraph(g), nodesOf(g))
    b.evaluate(audio, 1 / 60, midi)
    expect(b.values.get('p1.hit')).toBe(0)
  })

  it('kabel MPC.hit steruje parametrem filtra', () => {
    let g = withNodes(mpc('p1'))
    g = connect(g, { from: 'p1.hit', to: 'vignette1.darkness' })
    const b = new SignalBus(compileGraph(g), nodesOf(g))
    const midi = new MidiState()
    b.evaluate(audio, 1 / 60, midi)
    midi.handle([0x90, 36, 127])
    b.evaluate(audio, 0, midi)
    expect(b.number('vignette1', 'darkness')).toBeCloseTo(1)
  })
})
