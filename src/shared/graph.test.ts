import { describe, expect, it } from 'vitest'
import {
  appendFilter,
  applyEdge,
  canConnect,
  connect,
  controlOrder,
  defaultGraph,
  deleteElements,
  getChain,
  moveInChain,
  removeNode,
  sanitizeGraph,
  sanitizeParam
} from './graph'
import { NODE_DEFS } from './nodes'
import type { Graph } from './types'

const chainIds = (g: Graph): string[] => getChain(g).filters.map((n) => n.id)

describe('getChain', () => {
  it('idzie od wyjścia do źródła', () => {
    const chain = getChain(defaultGraph())
    expect(chain.source?.id).toBe('v1')
    expect(chain.output?.id).toBe('out')
    expect(chainIds(defaultGraph())).toEqual(['huesaturation1', 'bloom1', 'rgbsplit1', 'vignette1'])
  })
})

describe('canConnect / connect', () => {
  const g = defaultGraph()

  it('akceptuje sygnał audio → parametr liczbowy', () => {
    expect(canConnect(g, 'a1.mid', 'vignette1.darkness')).toBe(true)
  })

  it('odrzuca niezgodne porty', () => {
    expect(canConnect(g, 'a1.bass', 'bloom1.input')).toBe(false)
    expect(canConnect(g, 'v1.video', 'bloom1.intensity')).toBe(false)
    expect(canConnect(g, 'a1.bass', 'v1.loop')).toBe(false)
  })

  it('odrzuca cykle', () => {
    expect(canConnect(g, 'vignette1.video', 'huesaturation1.input')).toBe(false)
  })

  it('zastępuje poprzednią krawędź do tego samego wejścia', () => {
    const next = connect(g, { from: 'a1.high', to: 'bloom1.intensity' })
    const into = next.edges.filter((e) => e.to === 'bloom1.intensity')
    expect(into).toEqual([{ from: 'a1.high', to: 'bloom1.intensity' }])
  })
})

describe('operacje na łańcuchu', () => {
  it('appendFilter wstawia filtr przed wyjściem', () => {
    const next = appendFilter(defaultGraph(), 'Glitch')
    expect(chainIds(next)).toEqual([
      'huesaturation1',
      'bloom1',
      'rgbsplit1',
      'vignette1',
      'glitch1'
    ])
  })

  it('moveInChain zamienia sąsiadów', () => {
    const next = moveInChain(defaultGraph(), 'bloom1', -1)
    expect(chainIds(next)).toEqual(['bloom1', 'huesaturation1', 'rgbsplit1', 'vignette1'])
    expect(getChain(next).source?.id).toBe('v1')
  })

  it('removeNode z heal nie przerywa łańcucha', () => {
    const next = removeNode(defaultGraph(), 'rgbsplit1', true)
    expect(chainIds(next)).toEqual(['huesaturation1', 'bloom1', 'vignette1'])
    expect(next.edges.some((e) => e.from.startsWith('a1.beat'))).toBe(false)
  })
})

describe('sanitizeGraph', () => {
  it('zachowuje poprawny graf', () => {
    expect(sanitizeGraph(defaultGraph())).toEqual(defaultGraph())
  })

  it('odrzuca śmieci i przycina wartości', () => {
    const g = sanitizeGraph({
      nodes: [
        { id: 'b', type: 'Bloom', params: { intensity: 999, threshold: 'x' } },
        { id: 'bad id!', type: 'Bloom', params: {} },
        { id: 'z', type: 'Nope', params: {} }
      ],
      edges: [{ from: 'b.video', to: 'missing.input' }, 'junk']
    })
    expect(g.nodes.map((n) => n.id)).toEqual(['b', 'out'])
    expect(g.nodes[0].params.intensity).toBe(10)
    expect(g.nodes[0].params.threshold).toBe(0.4)
    expect(g.edges).toEqual([])
  })

  it('zwraca domyślny graf dla złego wejścia', () => {
    expect(sanitizeGraph(null)).toEqual(defaultGraph())
  })
})

describe('pozostałe', () => {
  it('sanitizeParam sprawdza typy', () => {
    expect(sanitizeParam('VideoFile', 'loop', 1)).toBeUndefined()
    expect(sanitizeParam('LFO', 'shape', 2)).toBe(2)
    expect(sanitizeParam('LFO', 'shape', 7)).toBeUndefined()
  })

  it('applyEdge skaluje i przycina do zakresu parametru', () => {
    const range = NODE_DEFS.Bloom.params[0]
    if (range.kind !== 'number') throw new Error()
    expect(applyEdge(0.5, { from: '', to: '', scale: 4, offset: 0.5 }, range)).toBe(2.5)
    expect(applyEdge(10, { from: '', to: '', scale: 4 }, range)).toBe(10)
  })

  it('controlOrder liczy Math po swoim źródle', () => {
    let g = defaultGraph()
    g = { ...g, nodes: [{ id: 'm1', type: 'Math', params: {} }, ...g.nodes] }
    g = connect(g, { from: 'a1.bass', to: 'm1.in' })
    expect(controlOrder(g).map((n) => n.id)).toEqual(['a1', 'm1'])
  })
})

describe('deleteElements', () => {
  it('usuwa filtr i naprawia łańcuch, mimo że React Flow usuwa też jego kable', () => {
    // Delete na bloom1: React Flow podaje node i wszystkie jego kable.
    const next = deleteElements(
      defaultGraph(),
      ['bloom1'],
      ['bloom1.input', 'rgbsplit1.input', 'bloom1.intensity']
    )
    expect(chainIds(next)).toEqual(['huesaturation1', 'rgbsplit1', 'vignette1'])
    expect(next.nodes.some((n) => n.id === 'bloom1')).toBe(false)
  })

  it('nie usuwa wyjścia', () => {
    const next = deleteElements(defaultGraph(), ['out'])
    expect(next.nodes.some((n) => n.id === 'out')).toBe(true)
    expect(chainIds(next)).toEqual(['huesaturation1', 'bloom1', 'rgbsplit1', 'vignette1'])
  })

  it('usuwa sam kabel', () => {
    const next = deleteElements(defaultGraph(), [], ['bloom1.intensity'])
    expect(next.edges.some((e) => e.to === 'bloom1.intensity')).toBe(false)
    expect(next.nodes).toHaveLength(defaultGraph().nodes.length)
  })

  it('usuwa kilka node’ów naraz, w tym źródło sygnału', () => {
    const next = deleteElements(defaultGraph(), ['a1', 'rgbsplit1', 'vignette1'])
    expect(chainIds(next)).toEqual(['huesaturation1', 'bloom1'])
    expect(next.edges.some((e) => e.from.startsWith('a1.'))).toBe(false)
  })
})
