// Kompilacja grafu (tylko przy zmianie struktury) i liczenie sygnałów (co klatkę).

import { applyEdge, controlOrder, getChain, splitPort } from '@shared/graph'
import { NODE_DEFS, clamp, findNumberParam, type NumberParamDef } from '@shared/nodes'
import type { AudioLevels, Graph, GraphEdge, GraphNode } from '@shared/types'
import { PAD_COUNT, type MidiState } from './midi/state'

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

/** Stan obwiedni jednego node'a MPC (tworzony raz, potem modyfikowany w miejscu). */
interface MpcEnvelope {
  level: number
  /** Licznik uderzeń widziany w poprzedniej klatce. */
  seen: number
  pad: number
}

/** Liczba uderzeń wybranego padu (1–16) albo wszystkich (0). */
function hitCount(midi: MidiState, pad: number): number {
  if (pad > 0) return midi.hits[pad - 1] ?? 0
  let sum = 0
  for (let i = 0; i < PAD_COUNT; i++) sum += midi.hits[i]
  return sum
}

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

/**
 * Krok wygładzania: wykładnicze dążenie do `target` ze stałą czasową ataku (gdy rośnie)
 * albo zwolnienia (gdy maleje), w ms. 0 ms przepuszcza od razu.
 */
export function smoothStep(
  prev: number,
  target: number,
  dt: number,
  attackMs: number,
  releaseMs: number
): number {
  const tau = (target > prev ? attackMs : releaseMs) / 1000
  if (!(tau > 0)) return target
  return prev + (target - prev) * (1 - Math.exp(-Math.max(0, dt) / tau))
}

/** Wartości sygnałów w bieżącej klatce i rozwiązywanie parametrów z kablami. */
export class SignalBus {
  readonly values = new Map<string, number>()
  private readonly phases = new Map<string, number>()
  private readonly smoothed = new Map<string, number>()
  private readonly envelopes = new Map<string, MpcEnvelope>()

  constructor(
    private compiled: CompiledGraph,
    private nodes: Map<string, GraphNode>
  ) {}

  setGraph(compiled: CompiledGraph, nodes: Map<string, GraphNode>): void {
    this.compiled = compiled
    this.nodes = nodes
    for (const id of this.smoothed.keys()) if (!nodes.has(id)) this.smoothed.delete(id)
    // Usunięty node MPC traci obwiednię, żeby node dodany z tym samym id zaczął od zera.
    for (const id of this.envelopes.keys()) if (!nodes.has(id)) this.envelopes.delete(id)
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

  /** Obwiednia node'a MPC. Przy pierwszej ocenie zapamiętuje licznik bez uderzenia. */
  private mpcNode(id: string, midi: MidiState | undefined, pad: number): MpcEnvelope {
    let env = this.envelopes.get(id)
    if (!env) {
      env = { level: 0, seen: midi ? hitCount(midi, pad) : 0, pad }
      this.envelopes.set(id, env)
    } else if (env.pad !== pad) {
      // Zmiana padu w panelu: start od bieżącego licznika, bez fałszywego uderzenia.
      env.pad = pad
      env.seen = midi ? hitCount(midi, pad) : 0
    }
    return env
  }

  private evaluateMpc(id: string, node: GraphNode, midi: MidiState | undefined, dt: number): void {
    const pad = typeof node.params.pad === 'number' ? node.params.pad : 0
    const env = this.mpcNode(id, midi, pad)
    const gain = this.number(id, 'gain')
    const decay = Math.max(0.05, this.number(id, 'decay'))
    let held = 0
    if (midi) {
      const count = hitCount(midi, pad)
      if (count !== env.seen) {
        env.seen = count
        const p = pad > 0 ? pad - 1 : midi.lastPad
        env.level = p >= 0 ? midi.velocity[p] : 0
      } else {
        env.level *= Math.exp((-dt * 4.6) / decay)
      }
      if (pad > 0) held = midi.pressure[pad - 1]
      else for (let i = 0; i < PAD_COUNT; i++) held = Math.max(held, midi.pressure[i])
    }
    this.values.set(`${id}.hit`, clamp(env.level * gain, 0, 1))
    this.values.set(`${id}.held`, clamp(held * gain, 0, 1))
    this.values.set(`${id}.last`, midi && midi.lastPad >= 0 ? midi.lastPad / (PAD_COUNT - 1) : 0)
  }

  evaluate(audio: AudioLevels, dt: number, midi?: MidiState): void {
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
        case 'Smooth': {
          const input = this.number(id, 'in')
          const prev = this.smoothed.get(id) ?? 0
          const v = smoothStep(
            prev,
            input,
            dt,
            this.number(id, 'attack'),
            this.number(id, 'release')
          )
          this.smoothed.set(id, v)
          this.values.set(`${id}.out`, v)
          break
        }
        case 'MPC':
          this.evaluateMpc(id, node, midi, dt)
          break
      }
    }
  }
}
