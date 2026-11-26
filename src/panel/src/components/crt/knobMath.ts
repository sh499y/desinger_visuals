// Logika pokręteł node'ów CRT: kąt, przeciąganie i wartość „na żywo” z kabla.

import { applyEdge, splitPort } from '@shared/graph'
import { clamp, findNumberParam, type NumberParamDef } from '@shared/nodes'
import type { AudioLevels, Graph, GraphEdge } from '@shared/types'

/** Node'y rysowane jako analogowe panele CRT (po 3 pokrętła). */
export const CRT_TYPES = [
  'CRTGuns',
  'CRTCircuit',
  'CRTEcho',
  'CRTSignal',
  'CRTTube',
  'CRTFlicker'
] as const
export type CrtType = (typeof CRT_TYPES)[number]
export const isCrtType = (t: string): t is CrtType => (CRT_TYPES as readonly string[]).includes(t)

export const KNOB_SWEEP = 270
/** Tyle pikseli przeciągania w pionie przechodzi cały zakres. */
const DRAG_RANGE_PX = 200

export function knobAngle(v: number, min: number, max: number): number {
  const t = max > min ? clamp((v - min) / (max - min), 0, 1) : 0
  return (t - 0.5) * KNOB_SWEEP
}

/** Nowa wartość po przeciągnięciu o `dy` px (w górę = ujemne `dy`). */
export function dragValue(start: number, dy: number, fine: boolean, def: NumberParamDef): number {
  const span = def.max - def.min
  const v = start - (dy / DRAG_RANGE_PX) * span * (fine ? 0.1 : 1)
  const stepped = def.min + Math.round((v - def.min) / def.step) * def.step
  return clamp(Number(stepped.toFixed(6)), def.min, def.max)
}

const AUDIO_PORTS = ['bass', 'mid', 'high', 'level', 'beat'] as const

/**
 * Wartość parametru prowadzonego kablem: null = brak kabla. Dla kabla z Audio
 * liczona z mierników (jak w silniku), dla innych źródeł panel nie zna sygnału,
 * więc zwraca wartość ustawioną w node.
 */
export function liveValue(
  graph: Graph,
  nodeId: string,
  key: string,
  audio: AudioLevels
): number | null {
  const edge = graph.edges.find((e) => e.to === `${nodeId}.${key}`)
  if (!edge) return null
  const node = graph.nodes.find((n) => n.id === nodeId)
  const def = node && findNumberParam(node.type, key)
  if (!node || !def) return null
  const from = splitPort(edge.from)
  const source = graph.nodes.find((n) => n.id === from.node)
  const port = AUDIO_PORTS.find((p) => p === from.port)
  if (source?.type === 'AudioIn' && port) {
    const gain = typeof source.params.gain === 'number' ? source.params.gain : 1
    const level = port === 'beat' ? audio.beat : clamp(audio[port] * gain, 0, 1)
    return applyEdge(level, edge, def)
  }
  const v = node.params[key]
  return typeof v === 'number' ? v : def.default
}

const tidy = (v: number): number => Number(v.toFixed(6))

export interface ModRange {
  /** Wartość przy ciszy (offset kabla). */
  base: number
  /** O ile przekręca pełny sygnał (skala kabla, może być ujemna). */
  depth: number
  /** Zakres, który kabel faktycznie osiąga, przycięty do parametru. */
  lo: number
  hi: number
}

/** Kabel → baza i głębokość modulacji pokrętła (wartość = sygnał × skala + offset). */
export function modRange(edge: GraphEdge, def: NumberParamDef): ModRange {
  const base = edge.offset ?? 0
  const depth = edge.scale ?? 1
  const a = clamp(base, def.min, def.max)
  const b = clamp(base + depth, def.min, def.max)
  return { base, depth, lo: tidy(Math.min(a, b)), hi: tidy(Math.max(a, b)) }
}

/** Łuk modulacji w kątach pokrętła (0 = góra, zgodnie z ruchem wskazówek). */
export function arcSpan(
  base: number,
  depth: number,
  def: NumberParamDef
): { start: number; sweep: number } {
  const a = knobAngle(base, def.min, def.max)
  const b = knobAngle(base + depth, def.min, def.max)
  return { start: Math.min(a, b), sweep: Math.abs(b - a) }
}

/** Nowa głębokość po przeciągnięciu pierścienia o `dy` px (w górę = więcej). */
export function dragDepth(start: number, dy: number, fine: boolean, def: NumberParamDef): number {
  const span = def.max - def.min
  const v = start - (dy / DRAG_RANGE_PX) * span * (fine ? 0.1 : 1)
  return clamp(tidy(Math.round(v / def.step) * def.step), -span, span)
}
