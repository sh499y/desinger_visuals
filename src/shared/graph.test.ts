import { describe, expect, it } from 'vitest'
import {
  NODE_STEP,
  addNode,
  appendFilter,
  applyEdge,
  canConnect,
  connect,
  controlOrder,
  createNode,
  defaultGraph,
  deleteElements,
  detachVideo,
  getChain,
  insertFilter,
  moveInChain,
  removeNode,
  sanitizeGraph,
  sanitizeParam,
  spliceIntoEdge,
  videoLinkToNode
} from './graph'
import { NODE_DEFS, defaultParams, type NodeType } from './nodes'
import type { Graph, GraphNode } from './types'

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

  it('przyjmuje node MPC i poprawia wartości spoza zakresu', () => {
    const g = sanitizeGraph({
      nodes: [{ id: 'm', type: 'MPC', params: { pad: 99, decay: 10, gain: 2 } }],
      edges: []
    })
    expect(g.nodes[0].type).toBe('MPC')
    expect(g.nodes[0].params.pad).toBe(0)
    expect(g.nodes[0].params.decay).toBe(3)
    expect(g.nodes[0].params.gain).toBe(2)
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

const at = (g: Graph, id: string): { x: number; y: number } | undefined =>
  g.nodes.find((n) => n.id === id)?.position
const into = (g: Graph, to: string): string | undefined => g.edges.find((e) => e.to === to)?.from
const mk = (id: string, type: NodeType, x: number, y = 0): GraphNode => ({
  id,
  type,
  params: defaultParams(type),
  position: { x, y }
})
/** Domyślny graf z luźnym, niepodłączonym filtrem `glitch1`. */
const withLoose = (): Graph => addNode(defaultGraph(), createNode(defaultGraph(), 'Glitch'))

describe('detachVideo', () => {
  it('wypina filtr z łańcucha i łączy sąsiadów, kable sygnału zostają', () => {
    const next = detachVideo(defaultGraph(), 'bloom1')
    expect(chainIds(next)).toEqual(['huesaturation1', 'rgbsplit1', 'vignette1'])
    expect(next.nodes.some((n) => n.id === 'bloom1')).toBe(true)
    expect(into(next, 'bloom1.input')).toBeUndefined()
    expect(next.edges.some((e) => e.from === 'bloom1.video')).toBe(false)
    expect(into(next, 'bloom1.intensity')).toBe('a1.bass')
  })

  it('łączy poprzednika ze wszystkimi odbiorcami', () => {
    let g = connect(defaultGraph(), { from: 'bloom1.video', to: 'out.input' })
    g = detachVideo(g, 'bloom1')
    expect(into(g, 'rgbsplit1.input')).toBe('huesaturation1.video')
    expect(into(g, 'out.input')).toBe('huesaturation1.video')
  })

  it('bez wejścia obrazu zostawia dawnych odbiorców bez wejścia', () => {
    let g = withLoose()
    g = connect(g, { from: 'glitch1.video', to: 'out.input' })
    const next = detachVideo(g, 'glitch1')
    expect(into(next, 'out.input')).toBeUndefined()
    expect(next.edges.some((e) => e.from === 'glitch1.video')).toBe(false)
    expect(next.edges).toHaveLength(g.edges.length - 1)
  })

  it('bez kabli obrazu zwraca ten sam graf', () => {
    const g = withLoose()
    expect(detachVideo(g, 'glitch1')).toBe(g)
  })
})

describe('insertFilter', () => {
  it('wstawia za zaznaczonym filtrem i rozsuwa dalszą część łańcucha', () => {
    const { graph, id } = insertFilter(defaultGraph(), 'Noise', 'bloom1')
    expect(id).toBe('noise1')
    expect(chainIds(graph)).toEqual([
      'huesaturation1',
      'bloom1',
      'noise1',
      'rgbsplit1',
      'vignette1'
    ])
    expect(at(graph, 'noise1')).toEqual({ x: 480 + NODE_STEP, y: 0 })
    // rgbsplit1 stał na 720, potrzebuje 760 + 280 = 1040, więc cały dół łańcucha +320.
    expect(at(graph, 'rgbsplit1')).toEqual({ x: 1040, y: 0 })
    expect(at(graph, 'vignette1')).toEqual({ x: 1280, y: 0 })
    expect(at(graph, 'out')).toEqual({ x: 1520, y: 0 })
    // Węzły przed wstawionym i sterujące stoją w miejscu, kable sygnału zostają.
    expect(at(graph, 'huesaturation1')).toEqual({ x: 240, y: 0 })
    expect(at(graph, 'bloom1')).toEqual({ x: 480, y: 0 })
    expect(at(graph, 'a1')).toEqual({ x: 240, y: 260 })
    expect(into(graph, 'rgbsplit1.amount')).toBe('a1.beat')
  })

  it('nie przesuwa węzłów, gdy miejsca jest dość', () => {
    const g: Graph = {
      version: 1,
      nodes: [mk('v1', 'VideoFile', 0), mk('out', 'Output', 1200)],
      edges: [{ from: 'v1.video', to: 'out.input' }]
    }
    const { graph, id } = insertFilter(g, 'Bloom', 'v1')
    expect(into(graph, `${id}.input`)).toBe('v1.video')
    expect(into(graph, 'out.input')).toBe(`${id}.video`)
    expect(at(graph, id)).toEqual({ x: NODE_STEP, y: 0 })
    expect(at(graph, 'out')).toEqual({ x: 1200, y: 0 })
  })

  it.each([null, 'out', 'a1', 'nieistnieje'])('z after=%s wstawia przed wyjściem', (after) => {
    const { graph, id } = insertFilter(defaultGraph(), 'Glitch', after)
    expect(chainIds(graph)).toEqual(['huesaturation1', 'bloom1', 'rgbsplit1', 'vignette1', id])
    expect(at(graph, id)).toEqual({ x: 960 + NODE_STEP, y: 0 })
    expect(at(graph, 'out')).toEqual({ x: 960 + 2 * NODE_STEP, y: 0 })
  })

  it('przejmuje wszystkie wyjściowe kable obrazu zaznaczonego node’a', () => {
    const g = connect(defaultGraph(), { from: 'bloom1.video', to: 'out.input' })
    const { graph, id } = insertFilter(g, 'Noise', 'bloom1')
    expect(graph.edges.filter((e) => e.from === 'bloom1.video')).toEqual([
      { from: 'bloom1.video', to: `${id}.input` }
    ])
    expect(into(graph, 'rgbsplit1.input')).toBe(`${id}.video`)
    expect(into(graph, 'out.input')).toBe(`${id}.video`)
  })

  it('przy pustym wejściu wyjścia staje w miejscu Output i go odsuwa', () => {
    const g: Graph = { version: 1, nodes: [mk('out', 'Output', 500, 40)], edges: [] }
    const { graph, id } = insertFilter(g, 'Bloom', null)
    expect(at(graph, id)).toEqual({ x: 500, y: 40 })
    expect(at(graph, 'out')).toEqual({ x: 500 + NODE_STEP, y: 40 })
    expect(graph.edges).toEqual([{ from: `${id}.video`, to: 'out.input' }])
  })

  it('nie mutuje wejścia', () => {
    const g = defaultGraph()
    insertFilter(g, 'Noise', 'bloom1')
    expect(g).toEqual(defaultGraph())
  })
})

describe('spliceIntoEdge', () => {
  it('wpina luźny filtr w kabel obrazu', () => {
    const next = spliceIntoEdge(withLoose(), 'glitch1', 'bloom1.input')
    expect(chainIds(next)).toEqual([
      'huesaturation1',
      'glitch1',
      'bloom1',
      'rgbsplit1',
      'vignette1'
    ])
  })

  it('przenosi filtr w łańcuchu i naprawia lukę', () => {
    const next = spliceIntoEdge(defaultGraph(), 'bloom1', 'vignette1.input')
    expect(chainIds(next)).toEqual(['huesaturation1', 'rgbsplit1', 'bloom1', 'vignette1'])
    expect(into(next, 'bloom1.intensity')).toBe('a1.bass')
  })

  it('odmawia dla własnego kabla, kabla sygnału i node’a, który nie jest filtrem', () => {
    const g = withLoose()
    expect(spliceIntoEdge(g, 'bloom1', 'bloom1.input')).toBe(g)
    expect(spliceIntoEdge(g, 'bloom1', 'rgbsplit1.input')).toBe(g)
    expect(spliceIntoEdge(g, 'glitch1', 'bloom1.intensity')).toBe(g)
    expect(spliceIntoEdge(g, 'a1', 'bloom1.input')).toBe(g)
    expect(spliceIntoEdge(g, 'v1', 'bloom1.input')).toBe(g)
    expect(spliceIntoEdge(g, 'out', 'bloom1.input')).toBe(g)
    expect(spliceIntoEdge(g, 'glitch1', 'nic.input')).toBe(g)
  })

  it('odmawia, gdy powstałby cykl', () => {
    // Graf z cyklem (nie powstanie przez connect, ale może przyjść z zewnątrz).
    const g: Graph = {
      version: 1,
      nodes: [mk('a', 'Bloom', 0), mk('b', 'Glitch', 240), mk('n', 'Noise', 480)],
      edges: [
        { from: 'a.video', to: 'b.input' },
        { from: 'b.video', to: 'a.input' }
      ]
    }
    expect(spliceIntoEdge(g, 'n', 'b.input')).toBe(g)
  })
})

describe('videoLinkToNode', () => {
  it('kabel z wyjścia obrazu trafia do wejścia node’a', () => {
    expect(videoLinkToNode(withLoose(), 'bloom1.video', 'source', 'glitch1')).toEqual({
      from: 'bloom1.video',
      to: 'glitch1.input'
    })
  })

  it('kabel od wejścia obrazu wychodzi z wyjścia node’a', () => {
    expect(videoLinkToNode(withLoose(), 'rgbsplit1.input', 'target', 'glitch1')).toEqual({
      from: 'glitch1.video',
      to: 'rgbsplit1.input'
    })
  })

  it('zajęte wejście jest w porządku: nowy kabel zastąpi stary', () => {
    expect(videoLinkToNode(defaultGraph(), 'v1.video', 'source', 'bloom1')).toEqual({
      from: 'v1.video',
      to: 'bloom1.input'
    })
  })

  it('zwraca null dla sygnału, braku portu, tego samego node’a i cyklu', () => {
    const g = withLoose()
    expect(videoLinkToNode(g, 'a1.bass', 'source', 'glitch1')).toBeNull()
    expect(videoLinkToNode(g, 'bloom1.intensity', 'target', 'a1')).toBeNull()
    expect(videoLinkToNode(g, 'bloom1.video', 'source', 'a1')).toBeNull()
    expect(videoLinkToNode(g, 'rgbsplit1.input', 'target', 'out')).toBeNull()
    expect(videoLinkToNode(g, 'bloom1.video', 'source', 'bloom1')).toBeNull()
    expect(videoLinkToNode(g, 'vignette1.video', 'source', 'huesaturation1')).toBeNull()
    expect(videoLinkToNode(g, 'nic.video', 'source', 'glitch1')).toBeNull()
  })
})
