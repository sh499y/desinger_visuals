// Operacje na grafie node'ów. Czyste funkcje: nie mutują wejścia.

import {
  NODE_DEFS,
  VIDEO_IN,
  VIDEO_OUT,
  clamp,
  defaultParams,
  findParam,
  isNodeType,
  type NodeType,
  type NumberParamDef
} from './nodes'
import type { Graph, GraphEdge, GraphNode, ParamValue } from './types'
import { encodeGradient, parseGradient } from './gradient'

export type PortKind = 'video' | 'signal'

export function splitPort(ref: string): { node: string; port: string } {
  const i = ref.lastIndexOf('.')
  return i < 0 ? { node: ref, port: '' } : { node: ref.slice(0, i), port: ref.slice(i + 1) }
}

export const portRef = (node: string, port: string): string => `${node}.${port}`

export function outputKind(node: GraphNode, port: string): PortKind | null {
  const def = NODE_DEFS[node.type]
  if (def.videoOut && port === VIDEO_OUT) return 'video'
  if (def.signalOut.includes(port)) return 'signal'
  return null
}

export function inputKind(node: GraphNode, port: string): PortKind | null {
  const def = NODE_DEFS[node.type]
  if (def.videoIn && port === VIDEO_IN) return 'video'
  if (def.signalIn.includes(port)) return 'signal'
  if (def.params.some((p) => p.key === port && p.kind === 'number')) return 'signal'
  return null
}

function nodeMap(graph: Graph): Map<string, GraphNode> {
  return new Map(graph.nodes.map((n) => [n.id, n]))
}

export function edgeKind(
  graph: Graph,
  edge: Pick<GraphEdge, 'from' | 'to'>,
  nodes = nodeMap(graph)
): PortKind | null {
  const f = splitPort(edge.from)
  const t = splitPort(edge.to)
  const fromNode = nodes.get(f.node)
  const toNode = nodes.get(t.node)
  if (!fromNode || !toNode || fromNode === toNode) return null
  const out = outputKind(fromNode, f.port)
  return out && out === inputKind(toNode, t.port) ? out : null
}

/** Czy z węzła `start` da się dojść krawędziami do `target`. */
function reaches(graph: Graph, start: string, target: string): boolean {
  const stack = [start]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const cur = stack.pop()!
    if (cur === target) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const e of graph.edges) {
      if (splitPort(e.from).node === cur) stack.push(splitPort(e.to).node)
    }
  }
  return false
}

export function canConnect(graph: Graph, from: string, to: string): boolean {
  if (!edgeKind(graph, { from, to })) return false
  return !reaches(graph, splitPort(to).node, splitPort(from).node)
}

/** Dodaje krawędź; poprzednia krawędź do tego samego wejścia jest zastępowana. */
export function connect(graph: Graph, edge: GraphEdge): Graph {
  const without = { ...graph, edges: graph.edges.filter((e) => e.to !== edge.to) }
  if (!canConnect(without, edge.from, edge.to)) return graph
  return { ...without, edges: [...without.edges, edge] }
}

export function disconnect(graph: Graph, to: string): Graph {
  return { ...graph, edges: graph.edges.filter((e) => e.to !== to) }
}

export function incomingEdge(graph: Graph, to: string): GraphEdge | undefined {
  return graph.edges.find((e) => e.to === to)
}

export function updateEdge(
  graph: Graph,
  to: string,
  patch: Partial<Pick<GraphEdge, 'scale' | 'offset'>>
): Graph {
  return {
    ...graph,
    edges: graph.edges.map((e) => (e.to === to ? { ...e, ...patch } : e))
  }
}

/** Wartość sygnału po przejściu przez kabel: clamp(sygnał × scale + offset, min, max). */
export function applyEdge(signal: number, edge: GraphEdge, range?: NumberParamDef): number {
  const v = signal * (edge.scale ?? 1) + (edge.offset ?? 0)
  return range ? clamp(v, range.min, range.max) : v
}

export interface Chain {
  source: GraphNode | null
  filters: GraphNode[]
  output: GraphNode | null
}

/** Łańcuch obrazu: od Output wstecz po wejściach video aż do źródła. */
export function getChain(graph: Graph): Chain {
  const nodes = nodeMap(graph)
  const output = graph.nodes.find((n) => n.type === 'Output') ?? null
  const filters: GraphNode[] = []
  let source: GraphNode | null = null
  if (!output) return { source, filters, output }

  const seen = new Set([output.id])
  let cur = output
  for (;;) {
    const e = incomingEdge(graph, portRef(cur.id, VIDEO_IN))
    if (!e) break
    const prev = nodes.get(splitPort(e.from).node)
    if (!prev || seen.has(prev.id)) break
    seen.add(prev.id)
    if (NODE_DEFS[prev.type].category === 'source') {
      source = prev
      break
    }
    filters.unshift(prev)
    cur = prev
  }
  return { source, filters, output }
}

/** Node'y sterujące w kolejności obliczania (najpierw te, od których zależą inne). */
export function controlOrder(graph: Graph): GraphNode[] {
  const controls = graph.nodes.filter((n) => NODE_DEFS[n.type].category === 'control')
  const ids = new Set(controls.map((n) => n.id))
  const indegree = new Map(controls.map((n) => [n.id, 0]))
  for (const e of graph.edges) {
    const f = splitPort(e.from).node
    const t = splitPort(e.to).node
    if (ids.has(f) && ids.has(t)) indegree.set(t, (indegree.get(t) ?? 0) + 1)
  }
  const order: GraphNode[] = []
  const queue = controls.filter((n) => indegree.get(n.id) === 0)
  const byId = nodeMap(graph)
  while (queue.length > 0) {
    const n = queue.shift()!
    order.push(n)
    for (const e of graph.edges) {
      if (splitPort(e.from).node !== n.id) continue
      const t = splitPort(e.to).node
      if (!ids.has(t)) continue
      const d = (indegree.get(t) ?? 0) - 1
      indegree.set(t, d)
      if (d === 0) queue.push(byId.get(t)!)
    }
  }
  // Węzły w cyklu (nie powinny wystąpić) liczone na końcu.
  for (const n of controls) if (!order.includes(n)) order.push(n)
  return order
}

export function nextNodeId(graph: Graph, type: NodeType): string {
  const prefix = type.toLowerCase()
  const used = new Set(graph.nodes.map((n) => n.id))
  let i = 1
  while (used.has(`${prefix}${i}`)) i++
  return `${prefix}${i}`
}

export function createNode(
  graph: Graph,
  type: NodeType,
  position?: { x: number; y: number }
): GraphNode {
  return { id: nextNodeId(graph, type), type, params: defaultParams(type), position }
}

export function addNode(graph: Graph, node: GraphNode): Graph {
  return { ...graph, nodes: [...graph.nodes, node] }
}

/**
 * Wypina node z łańcucha obrazu: usuwa kabel do jego wejścia obrazu i kable z jego
 * wyjścia obrazu, a poprzednika łączy z dawnymi odbiorcami, żeby łańcuch się nie przerwał.
 * Gdy node nie ma wejścia obrazu, nie ma czego naprawiać: dawni odbiorcy zostają bez
 * wejścia (świadomie, np. przy przenoszeniu luźnego filtra w inne miejsce).
 */
export function detachVideo(graph: Graph, id: string): Graph {
  const inRef = portRef(id, VIDEO_IN)
  const outRef = portRef(id, VIDEO_OUT)
  const incoming = incomingEdge(graph, inRef)
  const outgoing = graph.edges.filter((e) => e.from === outRef)
  if (!incoming && outgoing.length === 0) return graph
  const edges = graph.edges.filter((e) => e.to !== inRef && e.from !== outRef)
  if (incoming) for (const e of outgoing) edges.push({ from: incoming.from, to: e.to })
  return { ...graph, edges }
}

/**
 * Usuwa node. Z `heal` łączy jego wejście obrazu z odbiorcami jego wyjścia,
 * żeby łańcuch efektów się nie przerwał.
 */
export function removeNode(graph: Graph, id: string, heal = false): Graph {
  const g = heal ? detachVideo(graph, id) : graph
  const edges = g.edges.filter((e) => splitPort(e.from).node !== id && splitPort(e.to).node !== id)
  return { ...g, nodes: g.nodes.filter((n) => n.id !== id), edges }
}

/**
 * Usuwa zaznaczone node'y (z naprawą łańcucha; wyjścia nie da się usunąć) i kable.
 * `edgeIds` to wejścia kabli ("node.port"). Kable przy usuniętych node'ach są
 * pomijane, bo kabel naprawiający łańcuch dostaje to samo wejście co stary.
 */
export function deleteElements(graph: Graph, nodeIds: string[], edgeIds: string[] = []): Graph {
  const removed = new Set<string>()
  let next = graph
  for (const id of nodeIds) {
    const node = next.nodes.find((n) => n.id === id)
    if (!node || node.type === 'Output') continue
    next = removeNode(next, id, true)
    removed.add(id)
  }
  for (const to of edgeIds) {
    const edge = graph.edges.find((e) => e.to === to)
    if (!edge || removed.has(splitPort(edge.from).node) || removed.has(splitPort(to).node)) continue
    next = disconnect(next, to)
  }
  return next
}

export function updateNode(graph: Graph, id: string, patch: Partial<GraphNode>): Graph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }
}

export function setParam(graph: Graph, id: string, key: string, value: ParamValue): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n
    )
  }
}

/** Ustawia łańcuch obrazu w podanej kolejności (źródło → filtry → wyjście). */
function relinkChain(graph: Graph, chain: Chain, filters: GraphNode[]): Graph {
  const members = new Set([...chain.filters, ...filters].map((n) => n.id))
  if (chain.output) members.add(chain.output.id)
  let edges = graph.edges.filter((e) => {
    const t = splitPort(e.to)
    return !(members.has(t.node) && t.port === VIDEO_IN)
  })
  const seq = [chain.source, ...filters, chain.output]
  for (let i = 0; i < seq.length - 1; i++) {
    const a = seq[i]
    const b = seq[i + 1]
    if (a && b) edges = [...edges, { from: portRef(a.id, VIDEO_OUT), to: portRef(b.id, VIDEO_IN) }]
  }
  return { ...graph, edges }
}

/** Dodaje filtr na końcu łańcucha, tuż przed wyjściem. */
export function appendFilter(graph: Graph, type: NodeType): Graph {
  const chain = getChain(graph)
  const anchor = chain.output?.position ?? { x: 0, y: 0 }
  const node = createNode(graph, type, { ...anchor })
  let next = addNode(graph, node)
  if (chain.output) {
    next = updateNode(next, chain.output.id, { position: { x: anchor.x + 240, y: anchor.y } })
  }
  return relinkChain(next, chain, [...chain.filters, node])
}

/** Poziomy krok między node'ami: szerokość node'a (208 px) plus odstęp. */
export const NODE_STEP = 280

const isFilterType = (type: NodeType): boolean =>
  NODE_DEFS[type].videoIn && NODE_DEFS[type].videoOut

/** Pozycja node'a; bez zapisanej pozycji ta sama, co w edytorze (kolejne kolumny). */
function positionOf(graph: Graph, node: GraphNode): { x: number; y: number } {
  return node.position ?? { x: graph.nodes.indexOf(node) * 240, y: 0 }
}

/**
 * Wpina filtr w istniejący kabel obrazu `X.video → edgeTo`. Najpierw wypina go
 * z dotychczasowego miejsca (z naprawą łańcucha). Zwraca graf bez zmian, gdy node nie
 * jest filtrem, kabel nie jest kablem obrazu, kabel dotyczy samego node'a albo powstałby cykl.
 */
export function spliceIntoEdge(graph: Graph, nodeId: string, edgeTo: string): Graph {
  const node = graph.nodes.find((n) => n.id === nodeId)
  if (!node || !isFilterType(node.type)) return graph
  const edge = incomingEdge(graph, edgeTo)
  if (!edge || edgeKind(graph, edge) !== 'video') return graph
  if (splitPort(edge.from).node === nodeId || splitPort(edgeTo).node === nodeId) return graph

  const detached = detachVideo(graph, nodeId)
  const withIn = connect(detached, { from: edge.from, to: portRef(nodeId, VIDEO_IN) })
  if (withIn === detached) return graph
  const withOut = connect(withIn, { from: portRef(nodeId, VIDEO_OUT), to: edgeTo })
  return withOut === withIn ? graph : withOut
}

/** Node'y osiągalne kablami obrazu od `start` (bez niego). */
function videoDownstream(graph: Graph, start: string): Set<string> {
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length > 0) {
    const out = portRef(stack.pop()!, VIDEO_OUT)
    for (const e of graph.edges) {
      if (e.from !== out) continue
      const t = splitPort(e.to).node
      if (t === start || seen.has(t)) continue
      seen.add(t)
      stack.push(t)
    }
  }
  return seen
}

/**
 * Dodaje filtr do łańcucha obrazu. Gdy `after` ma wyjście obrazu, nowy node staje za nim
 * i przejmuje wszystkie jego wyjściowe kable obrazu. W innym przypadku wpina się przed
 * wyjściem (Output). Węzły w dół łańcucha przesuwają się w prawo tylko o tyle, ile
 * brakuje do odstępu `NODE_STEP`.
 */
export function insertFilter(
  graph: Graph,
  type: NodeType,
  after: string | null
): { graph: Graph; id: string } {
  const anchor = after ? graph.nodes.find((n) => n.id === after) : undefined
  const output = graph.nodes.find((n) => n.type === 'Output')

  let from: string | null = null
  let targets: string[] = []
  let position = { x: 0, y: 0 }
  if (anchor && NODE_DEFS[anchor.type].videoOut) {
    from = portRef(anchor.id, VIDEO_OUT)
    const out = from
    targets = graph.edges.filter((e) => e.from === out).map((e) => e.to)
    const p = positionOf(graph, anchor)
    position = { x: p.x + NODE_STEP, y: p.y }
  } else if (output) {
    const outIn = portRef(output.id, VIDEO_IN)
    targets = [outIn]
    const incoming = incomingEdge(graph, outIn)
    const prev = incoming && graph.nodes.find((n) => n.id === splitPort(incoming.from).node)
    if (incoming && prev) {
      from = incoming.from
      const p = positionOf(graph, prev)
      position = { x: p.x + NODE_STEP, y: p.y }
    } else {
      position = { ...positionOf(graph, output) }
    }
  }

  const node = createNode(graph, type, position)
  let next = addNode(graph, node)
  if (!isFilterType(type)) return { graph: next, id: node.id }

  if (from) next = connect(next, { from, to: portRef(node.id, VIDEO_IN) })
  for (const to of targets) next = connect(next, { from: portRef(node.id, VIDEO_OUT), to })

  // Rozsunięcie: cały dół łańcucha o ten sam wektor, żeby zachować jego układ.
  let nearest = Infinity
  for (const to of targets) {
    const t = next.nodes.find((n) => n.id === splitPort(to).node)
    if (t) nearest = Math.min(nearest, positionOf(next, t).x)
  }
  const shift = position.x + NODE_STEP - nearest
  if (shift > 0 && Number.isFinite(shift)) {
    const down = videoDownstream(next, node.id)
    const before = next
    next = {
      ...next,
      nodes: next.nodes.map((n) => {
        if (!down.has(n.id)) return n
        const p = positionOf(before, n)
        return { ...n, position: { x: p.x + shift, y: p.y } }
      })
    }
  }
  return { graph: next, id: node.id }
}

/**
 * Dobiera kabel obrazu, gdy ciągnięty kabel upuszczono na korpus node'a (nie na uchwyt).
 * `fromType` to rodzaj uchwytu, od którego zaczęto ciągnąć. Kable sygnału dają `null`,
 * bo port byłby niejednoznaczny.
 */
export function videoLinkToNode(
  graph: Graph,
  fromRef: string,
  fromType: 'source' | 'target',
  nodeId: string
): { from: string; to: string } | null {
  const f = splitPort(fromRef)
  const fromNode = graph.nodes.find((n) => n.id === f.node)
  const target = graph.nodes.find((n) => n.id === nodeId)
  if (!fromNode || !target || fromNode === target) return null
  let link: { from: string; to: string }
  if (fromType === 'source') {
    if (outputKind(fromNode, f.port) !== 'video' || !NODE_DEFS[target.type].videoIn) return null
    link = { from: fromRef, to: portRef(nodeId, VIDEO_IN) }
  } else {
    if (inputKind(fromNode, f.port) !== 'video' || !NODE_DEFS[target.type].videoOut) return null
    link = { from: portRef(nodeId, VIDEO_OUT), to: fromRef }
  }
  return canConnect(disconnect(graph, link.to), link.from, link.to) ? link : null
}

/** Przesuwa filtr w łańcuchu o jedno miejsce (-1 = bliżej źródła). */
export function moveInChain(graph: Graph, id: string, dir: -1 | 1): Graph {
  const chain = getChain(graph)
  const i = chain.filters.findIndex((n) => n.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= chain.filters.length) return graph
  const filters = [...chain.filters]
  ;[filters[i], filters[j]] = [filters[j], filters[i]]
  let next = relinkChain(graph, chain, filters)
  const a = chain.filters[i]
  const b = chain.filters[j]
  next = updateNode(next, a.id, { position: b.position })
  next = updateNode(next, b.id, { position: a.position })
  return next
}

/** Sprawdza wartość parametru; zwraca poprawioną wartość albo undefined, gdy jest błędna. */
export function sanitizeParam(type: NodeType, key: string, value: unknown): ParamValue | undefined {
  const def = findParam(type, key)
  if (!def) return undefined
  switch (def.kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? clamp(value, def.min, def.max)
        : undefined
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined
    case 'video':
      return value === null || (typeof value === 'string' && value.length <= 64) ? value : undefined
    case 'select':
      return def.options.some((o) => o.value === value) ? (value as number) : undefined
    case 'gradient': {
      const stops = typeof value === 'string' ? parseGradient(value) : null
      return stops ? encodeGradient(stops) : undefined
    }
  }
}

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Buduje poprawny graf z niezaufanych danych (sieć, plik projektu). */
export function sanitizeGraph(input: unknown): Graph {
  if (!isObj(input) || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    return defaultGraph()
  }
  const nodes: GraphNode[] = []
  const ids = new Set<string>()
  for (const raw of input.nodes) {
    if (!isObj(raw) || typeof raw.id !== 'string' || !ID_RE.test(raw.id) || ids.has(raw.id))
      continue
    if (!isNodeType(raw.type)) continue
    const params: Record<string, ParamValue> = defaultParams(raw.type)
    const rawParams = isObj(raw.params) ? raw.params : {}
    for (const key of Object.keys(params)) {
      const v = sanitizeParam(raw.type, key, rawParams[key])
      if (v !== undefined) params[key] = v
    }
    const node: GraphNode = { id: raw.id, type: raw.type, params }
    if (raw.bypass === true) node.bypass = true
    if (isObj(raw.position) && finite(raw.position.x) && finite(raw.position.y)) {
      node.position = { x: raw.position.x, y: raw.position.y }
    }
    ids.add(raw.id)
    nodes.push(node)
  }
  if (!nodes.some((n) => n.type === 'Output')) {
    nodes.push({
      id: 'out',
      type: 'Output',
      params: defaultParams('Output'),
      position: { x: 900, y: 0 }
    })
  }

  let graph: Graph = { version: 1, nodes, edges: [] }
  for (const raw of input.edges) {
    if (!isObj(raw) || typeof raw.from !== 'string' || typeof raw.to !== 'string') continue
    const edge: GraphEdge = { from: raw.from, to: raw.to }
    if (finite(raw.scale)) edge.scale = clamp(raw.scale, -100, 100)
    if (finite(raw.offset)) edge.offset = clamp(raw.offset, -100, 100)
    graph = connect(graph, edge)
  }
  return graph
}

export function defaultGraph(): Graph {
  const node = (
    id: string,
    type: NodeType,
    x: number,
    y: number,
    params: Record<string, ParamValue> = {}
  ): GraphNode => ({ id, type, params: { ...defaultParams(type), ...params }, position: { x, y } })

  return {
    version: 1,
    nodes: [
      node('v1', 'VideoFile', 0, 0),
      node('huesaturation1', 'HueSaturation', 240, 0),
      node('bloom1', 'Bloom', 480, 0),
      node('rgbsplit1', 'RGBSplit', 720, 0),
      node('vignette1', 'Vignette', 960, 0),
      node('out', 'Output', 1200, 0),
      node('a1', 'AudioIn', 240, 260)
    ],
    edges: [
      { from: 'v1.video', to: 'huesaturation1.input' },
      { from: 'huesaturation1.video', to: 'bloom1.input' },
      { from: 'bloom1.video', to: 'rgbsplit1.input' },
      { from: 'rgbsplit1.video', to: 'vignette1.input' },
      { from: 'vignette1.video', to: 'out.input' },
      { from: 'a1.bass', to: 'bloom1.intensity', scale: 4, offset: 0.5 },
      { from: 'a1.beat', to: 'rgbsplit1.amount', scale: 0.015, offset: 0.002 }
    ]
  }
}
