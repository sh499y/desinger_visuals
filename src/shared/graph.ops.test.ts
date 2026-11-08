// Uzupełnienie graph.test.ts: porty, pojedyncze operacje i przypadki brzegowe.

import { describe, expect, it } from 'vitest'
import {
  addNode,
  appendFilter,
  applyEdge,
  connect,
  createNode,
  defaultGraph,
  disconnect,
  edgeKind,
  getChain,
  incomingEdge,
  inputKind,
  moveInChain,
  nextNodeId,
  outputKind,
  portRef,
  sanitizeGraph,
  sanitizeParam,
  setParam,
  splitPort,
  updateEdge,
  updateNode
} from './graph'
import { defaultParams } from './nodes'
import type { Graph, GraphNode } from './types'

const node = (id: string, type: GraphNode['type']): GraphNode => ({
  id,
  type,
  params: defaultParams(type)
})
const byId = (g: Graph, id: string): GraphNode => g.nodes.find((n) => n.id === id)!

describe('porty', () => {
  it('splitPort / portRef', () => {
    expect(splitPort('bloom1.intensity')).toEqual({ node: 'bloom1', port: 'intensity' })
    expect(splitPort('bez-kropki')).toEqual({ node: 'bez-kropki', port: '' })
    expect(portRef('a1', 'bass')).toBe('a1.bass')
  })

  it('outputKind / inputKind', () => {
    const v = node('v', 'VideoFile')
    const b = node('b', 'Bloom')
    const a = node('a', 'AudioIn')
    const m = node('m', 'Math')
    expect(outputKind(v, 'video')).toBe('video')
    expect(outputKind(a, 'beat')).toBe('signal')
    expect(outputKind(b, 'beat')).toBeNull()
    expect(inputKind(b, 'input')).toBe('video')
    expect(inputKind(b, 'intensity')).toBe('signal')
    expect(inputKind(m, 'in')).toBe('signal')
    expect(inputKind(v, 'videoId')).toBeNull() // parametr nieliczbowy
    expect(inputKind(v, 'input')).toBeNull() // źródło nie ma wejścia obrazu
  })

  it('edgeKind odrzuca brakujące node’y i pętlę na siebie', () => {
    const g = defaultGraph()
    expect(edgeKind(g, { from: 'v1.video', to: 'out.input' })).toBe('video')
    expect(edgeKind(g, { from: 'ghost.video', to: 'out.input' })).toBeNull()
    expect(edgeKind(g, { from: 'bloom1.video', to: 'bloom1.input' })).toBeNull()
  })
})

describe('kable', () => {
  it('incomingEdge / disconnect / updateEdge', () => {
    const g = defaultGraph()
    expect(incomingEdge(g, 'bloom1.intensity')?.from).toBe('a1.bass')
    const updated = updateEdge(g, 'bloom1.intensity', { scale: 9 })
    expect(incomingEdge(updated, 'bloom1.intensity')).toMatchObject({ scale: 9, offset: 0.5 })
    expect(incomingEdge(disconnect(g, 'bloom1.intensity'), 'bloom1.intensity')).toBeUndefined()
  })

  it('connect pozwala rozgałęzić wyjście obrazu', () => {
    let g = addNode(defaultGraph(), node('b2', 'Bloom'))
    g = connect(g, { from: 'v1.video', to: 'b2.input' })
    expect(g.edges.filter((e) => e.from === 'v1.video')).toHaveLength(2)
  })

  it('connect zwraca ten sam graf dla złego kabla', () => {
    const g = defaultGraph()
    expect(connect(g, { from: 'a1.bass', to: 'out.input' })).toBe(g)
  })

  it('applyEdge bez zakresu nie przycina', () => {
    expect(applyEdge(2, { from: '', to: '', scale: 10, offset: -1 })).toBe(19)
    expect(applyEdge(0.5, { from: '', to: '' })).toBe(0.5)
  })
})

describe('node’y', () => {
  it('nextNodeId / createNode', () => {
    const g = defaultGraph()
    expect(nextNodeId(g, 'Bloom')).toBe('bloom2')
    expect(nextNodeId(g, 'Glitch')).toBe('glitch1')
    const n = createNode(g, 'LFO', { x: 1, y: 2 })
    expect(n).toEqual({
      id: 'lfo1',
      type: 'LFO',
      params: { rate: 0.5, shape: 0 },
      position: { x: 1, y: 2 }
    })
  })

  it('updateNode i setParam nie mutują wejścia', () => {
    const g = defaultGraph()
    const moved = updateNode(g, 'bloom1', { position: { x: 9, y: 9 } })
    const changed = setParam(moved, 'bloom1', 'intensity', 7)
    expect(byId(g, 'bloom1').position).toEqual({ x: 480, y: 0 })
    expect(byId(g, 'bloom1').params.intensity).toBe(1.5)
    expect(byId(changed, 'bloom1')).toMatchObject({
      position: { x: 9, y: 9 },
      params: { intensity: 7 }
    })
  })
})

describe('łańcuch – przypadki brzegowe', () => {
  it('graf bez wyjścia', () => {
    const g: Graph = { version: 1, nodes: [node('v', 'VideoFile')], edges: [] }
    expect(getChain(g)).toEqual({ source: null, filters: [], output: null })
  })

  it('łańcuch bez źródła zwraca filtry i source = null', () => {
    const g = disconnect(defaultGraph(), 'huesaturation1.input')
    const chain = getChain(g)
    expect(chain.source).toBeNull()
    expect(chain.filters).toHaveLength(4)
  })

  it('getChain nie zapętla się na uszkodzonym grafie z cyklem', () => {
    const g: Graph = {
      version: 1,
      nodes: [node('a', 'Bloom'), node('b', 'Bloom'), node('out', 'Output')],
      edges: [
        { from: 'a.video', to: 'out.input' },
        { from: 'b.video', to: 'a.input' },
        { from: 'a.video', to: 'b.input' }
      ]
    }
    expect(getChain(g).filters.map((n) => n.id)).toEqual(['b', 'a'])
  })

  it('moveInChain na brzegach nic nie zmienia', () => {
    const g = defaultGraph()
    expect(moveInChain(g, 'huesaturation1', -1)).toBe(g)
    expect(moveInChain(g, 'vignette1', 1)).toBe(g)
    expect(moveInChain(g, 'ghost', 1)).toBe(g)
  })

  it('appendFilter w pustym łańcuchu łączy filtr z wyjściem', () => {
    const g: Graph = { version: 1, nodes: [node('out', 'Output')], edges: [] }
    const next = appendFilter(g, 'Noise')
    expect(incomingEdge(next, 'out.input')?.from).toBe('noise1.video')
  })
})

describe('sanitizeGraph – dodatkowe przypadki', () => {
  it('zachowuje bypass i pozycję, pomija duplikaty id', () => {
    const g = sanitizeGraph({
      nodes: [
        { id: 'b', type: 'Bloom', bypass: true, position: { x: 1, y: 2 }, params: {} },
        { id: 'b', type: 'Noise', params: {} },
        { id: 'n', type: 'Noise', bypass: 'tak', position: { x: 'x', y: 0 } }
      ],
      edges: []
    })
    expect(g.nodes.map((n) => [n.id, n.type])).toEqual([
      ['b', 'Bloom'],
      ['n', 'Noise'],
      ['out', 'Output']
    ])
    expect(byId(g, 'b')).toMatchObject({ bypass: true, position: { x: 1, y: 2 } })
    expect(byId(g, 'n').bypass).toBeUndefined()
    expect(byId(g, 'n').position).toBeUndefined()
  })

  it('przycina skalę/offset kabla i odrzuca cykle', () => {
    const g = sanitizeGraph({
      nodes: [node('a', 'Bloom'), node('b', 'Bloom'), node('m', 'AudioIn'), node('out', 'Output')],
      edges: [
        { from: 'm.bass', to: 'a.intensity', scale: 1e9, offset: -1e9 },
        { from: 'a.video', to: 'b.input' },
        { from: 'b.video', to: 'a.input' }
      ]
    })
    expect(incomingEdge(g, 'a.intensity')).toMatchObject({ scale: 100, offset: -100 })
    expect(incomingEdge(g, 'a.input')).toBeUndefined()
  })

  it('sanitizeParam odrzuca nieskończoność i za długie id wideo', () => {
    expect(sanitizeParam('Bloom', 'intensity', Infinity)).toBeUndefined()
    expect(sanitizeParam('VideoFile', 'videoId', 'x'.repeat(65))).toBeUndefined()
    expect(sanitizeParam('VideoFile', 'videoId', null)).toBeNull()
    expect(sanitizeParam('Bloom', 'ghost', 1)).toBeUndefined()
  })
})
