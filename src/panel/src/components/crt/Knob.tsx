// Pokrętło 270°: przeciąganie w pionie (Shift = dokładnie), dwuklik = domyślna.
// Z wpiętym kablem pokrętło ustawia bazę modulacji (offset kabla), a pierścień
// wokół niego głębokość (skalę kabla); cyjanowy łuk pokazuje zakres, wskazówka
// wartość na żywo. W trakcie przeciągania zmiana jest lokalna, graf idzie do
// serwera po puszczeniu.

import { useRef } from 'react'
import { updateEdge } from '@shared/graph'
import type { NumberParamDef } from '@shared/nodes'
import type { GraphEdge } from '@shared/types'
import { commitGraph, setGraphLocal, setParamValue, usePanel } from '../../store'
import { arcSpan, dragDepth, dragValue, knobAngle, modRange } from './knobMath'

type Target = 'value' | 'base' | 'depth'

export function Knob({
  nodeId,
  def,
  value,
  edge
}: {
  nodeId: string
  def: NumberParamDef
  value: number
  /** Kabel wpięty w ten parametr (modulacja). */
  edge?: GraphEdge
}): React.JSX.Element {
  const drag = useRef<{ target: Target; y: number; start: number; last: number } | null>(null)
  const mod = edge && modRange(edge, def)

  const begin = (e: React.PointerEvent<HTMLElement>, target: Target, start: number): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { target, y: e.clientY, start, last: start }
  }

  const move = (e: React.PointerEvent<HTMLElement>): void => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y
    const v =
      d.target === 'depth'
        ? dragDepth(d.start, dy, e.shiftKey, def)
        : dragValue(d.start, dy, e.shiftKey, def)
    if (v === d.last) return
    d.last = v
    if (d.target === 'value') {
      setParamValue(nodeId, def.key, v)
      return
    }
    const graph = usePanel.getState().app?.graph
    if (!graph || !edge) return
    const patch = d.target === 'base' ? { offset: v } : { scale: v }
    setGraphLocal(updateEdge(graph, edge.to, patch))
  }

  const end = (): void => {
    const d = drag.current
    drag.current = null
    if (!d || d.target === 'value' || d.last === d.start) return
    const graph = usePanel.getState().app?.graph
    if (graph) commitGraph(graph)
  }

  const reset = (): void => {
    if (!mod) {
      setParamValue(nodeId, def.key, def.default)
      return
    }
    const graph = usePanel.getState().app?.graph
    if (graph && edge) commitGraph(updateEdge(graph, edge.to, { offset: def.default }))
  }

  const arc = mod && arcSpan(mod.base, mod.depth, def)
  const fmt = (v: number): string => v.toFixed(2)
  const title = mod
    ? `${def.label}: ${fmt(value)} · baza ${fmt(mod.base)}, zakres ${fmt(mod.lo)}–${fmt(mod.hi)}\n` +
      'Przeciągnij pokrętło: baza · pierścień: głębokość · Shift: dokładnie'
    : `${def.label}: ${fmt(value)}`

  return (
    <div
      className={`crt-knob nodrag nopan ${mod ? 'crt-driven' : ''}`}
      role="slider"
      aria-label={def.label}
      aria-valuemin={def.min}
      aria-valuemax={def.max}
      aria-valuenow={value}
      title={title}
      onPointerDown={(e) => begin(e, mod ? 'base' : 'value', mod ? mod.base : value)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={reset}
    >
      <div className="crt-knob-scale" />
      {arc && (
        <div
          className="crt-knob-arc"
          style={{
            background: `conic-gradient(from ${arc.start}deg, #22d3ee 0 ${arc.sweep}deg, transparent 0)`
          }}
        />
      )}
      {mod && (
        <div
          className="crt-knob-ring"
          title="Przeciągnij: głębokość modulacji"
          onPointerDown={(e) => begin(e, 'depth', mod.depth)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      )}
      <div className="crt-knob-skirt" />
      <div
        className="crt-knob-cap"
        style={{ transform: `rotate(${knobAngle(value, def.min, def.max)}deg)` }}
      />
    </div>
  )
}
