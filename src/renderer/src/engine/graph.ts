// Kompilacja grafu (tylko przy zmianie struktury) i liczenie sygnałów (co klatkę).

import { applyEdge, controlOrder, getChain, splitPort } from '@shared/graph'
import { NODE_DEFS, clamp, findNumberParam, type NumberParamDef } from '@shared/nodes'
import type { AudioLevels, Graph, GraphEdge, GraphNode } from '@shared/types'

interface Binding {
  edge: GraphEdge
  /** "nodeId.port" sygnału źródłowego */
  from: string
  /** Zakres parametru docelowego (brak dla wejść sygnałowych jak Math.in). */
  range?: NumberParamDef
}

export interface CompiledGraph {
  sourceId: string | null
  /** Filtry w kolejności, bez wyłączonych (bypass). */
  filterIds: string[]
  outputId: string | null
  controlIds: string[]
  /** "nodeId.param" → kabel */
  bindings: Map<string, Binding>
  /** Zmienia się tylko, gdy trzeba przebudować przejścia efektów. */
  chainKey: string
}

export function compileGraph(graph: Graph): CompiledGraph {
  const chain = getChain(graph)
  const filters = chain.filters.filter((n) => !n.bypass)
  const types = new Map(graph.nodes.map((n) => [n.id, n.type]))
  const bindings = new Map<string, Binding>()
  for (const edge of graph.edges) {
    const t = splitPort(edge.to)
    const type = types.get(t.node)
    if (!type) continue
    const range = findNumberParam(type, t.port)
    if (range || NODE_DEFS[type].signalIn.includes(t.port)) {
      bindings.set(edge.to, { edge, from: edge.from, range })
    }
  }
  return {
    sourceId: chain.source?.id ?? null,
    filterIds: filters.map((n) => n.id),
    outputId: chain.output?.id ?? null,
    controlIds: controlOrder(graph).map((n) => n.id),
    bindings,
    chainKey: filters.map((n) => `${n.id}:${n.type}`).join('|')
  }
}

const TAU = Math.PI * 2

export function lfoShape(shape: number, phase: number): number {
  switch (shape) {
    case 1:
      return 1 - Math.abs(2 * phase - 1)
    case 2:
      return phase
    case 3:
      return phase < 0.5 ? 1 : 0
    default:
      return 0.5 - 0.5 * Math.cos(TAU * phase)
  }
}

/** Wartości sygnałów w bieżącej klatce i rozwiązywanie parametrów z kablami. */
export class SignalBus {
  readonly values = new Map<string, number>()
  private readonly phases = new Map<string, number>()

  constructor(
    private compiled: CompiledGraph,
    private nodes: Map<string, GraphNode>
  ) {}

  setGraph(compiled: CompiledGraph, nodes: Map<string, GraphNode>): void {
    this.compiled = compiled
    this.nodes = nodes
  }

  /** Parametr liczbowy: wartość z kabla albo z suwaka. */
  number(nodeId: string, key: string): number {
    const binding = this.compiled.bindings.get(`${nodeId}.${key}`)
    if (binding) return applyEdge(this.values.get(binding.from) ?? 0, binding.edge, binding.range)
    const node = this.nodes.get(nodeId)
    const v = node?.params[key]
    if (typeof v === 'number') return v
    const def = node && findNumberParam(node.type, key)
    return def ? def.default : 0
  }

  evaluate(audio: AudioLevels, dt: number): void {
    for (const id of this.compiled.controlIds) {
      const node = this.nodes.get(id)
      if (!node) continue
      switch (node.type) {
        case 'AudioIn': {
          const gain = this.number(id, 'gain')
          this.values.set(`${id}.bass`, clamp(audio.bass * gain, 0, 1))
          this.values.set(`${id}.mid`, clamp(audio.mid * gain, 0, 1))
          this.values.set(`${id}.high`, clamp(audio.high * gain, 0, 1))
          this.values.set(`${id}.level`, clamp(audio.level * gain, 0, 1))
          this.values.set(`${id}.beat`, audio.beat)
          break
        }
        case 'LFO': {
          const phase = ((this.phases.get(id) ?? 0) + dt * this.number(id, 'rate')) % 1
          this.phases.set(id, phase)
          const shape = typeof node.params.shape === 'number' ? node.params.shape : 0
          this.values.set(`${id}.value`, lfoShape(shape, phase))
          break
        }
        case 'Math': {
          const input = this.number(id, 'in')
          const lo = this.number(id, 'min')
          const hi = this.number(id, 'max')
          const v = input * this.number(id, 'scale') + this.number(id, 'offset')
          this.values.set(`${id}.out`, clamp(v, Math.min(lo, hi), Math.max(lo, hi)))
          break
        }
      }
    }
  }
}
