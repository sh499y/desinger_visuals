// Stan pokręteł node'a: parametry liczbowe, wartość na żywo z kabla audio i wpięty kabel.

import { NODE_DEFS, type NumberParamDef } from '@shared/nodes'
import type { GraphEdge, GraphNode } from '@shared/types'
import { usePanel } from '../../store'
import { liveValue } from './knobMath'

export interface KnobState {
  def: NumberParamDef
  value: number
  /** Kabel wpięty w pokrętło (modulacja). */
  edge?: GraphEdge
}

export function useKnobs(node: GraphNode): KnobState[] {
  const graph = usePanel((s) => s.app?.graph)
  const params = NODE_DEFS[node.type].params.filter((p) => p.kind === 'number')
  const edges = params.map((p) => graph?.edges.find((e) => e.to === `${node.id}.${p.key}`))
  // Mierniki audio przychodzą co ~100 ms: subskrybujemy je tylko, gdy pokrętło ma kabel.
  const cabled = edges.some(Boolean)
  const audio = usePanel((s) => (cabled ? s.audio : null))
  return params.map((p, i) => {
    const live = graph && audio ? liveValue(graph, node.id, p.key, audio) : null
    const set = node.params[p.key]
    return { def: p, value: live ?? (typeof set === 'number' ? set : p.default), edge: edges[i] }
  })
}
