// Pasek stopów gradientu w node'zie Dreamer Gradient.
// Klik w pasek dodaje stop, przeciąganie znacznika go przesuwa (jeden krok cofania),
// klik w znacznik go wybiera: pod paskiem kolor, Step (twardy) i Usuń. Kafelki = presety.

import { useRef, useState } from 'react'
import {
  GRADIENT_PRESETS,
  encodeGradient,
  parseGradient,
  type GradientStop
} from '@shared/gradient'
import { setParamValue } from '../../store'
import { addStop, cssGradient, removeStop, setColor, toggleHard } from './gradientEdit'

const PRESET_CSS = GRADIENT_PRESETS.map((p) => ({
  ...p,
  css: cssGradient(parseGradient(p.value) ?? [])
}))

export function GradientBar({
  nodeId,
  paramKey,
  label,
  value
}: {
  nodeId: string
  paramKey: string
  label: string
  value: string
}): React.JSX.Element {
  const stops = parseGradient(value) ?? []
  const bar = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const drag = useRef<{ others: GradientStop[]; stop: GradientStop; moved: boolean } | null>(null)

  const write = (next: GradientStop[]): void =>
    setParamValue(nodeId, paramKey, encodeGradient(next))
  const posAt = (clientX: number): number => {
    const r = bar.current?.getBoundingClientRect()
    return r && r.width > 0 ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0
  }

  const onBarDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || e.target !== e.currentTarget) return
    e.stopPropagation()
    const next = addStop(stops, posAt(e.clientX))
    write(next)
    setSelected(next.findIndex((s) => !stops.includes(s)))
  }

  const onStopDown = (e: React.PointerEvent<HTMLButtonElement>, i: number): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { others: stops.filter((_, k) => k !== i), stop: stops[i], moved: false }
    setSelected(i)
  }

  const onStopMove = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const d = drag.current
    if (!d) return
    const stop = { ...d.stop, pos: Number(posAt(e.clientX).toFixed(3)) }
    const next = [...d.others, stop].sort((a, b) => a.pos - b.pos)
    d.moved = true
    write(next)
    setSelected(next.indexOf(stop))
  }

  const sel = selected !== null && stops[selected] ? selected : null

  return (
    <div className="dr-grad nodrag nopan">
      <div className="dr-grad-head">
        <span className="dr-grad-label">{label}</span>
        {sel !== null && (
          <span className="dr-grad-tools">
            <input
              type="color"
              aria-label="Kolor stopu"
              value={stops[sel].color}
              onChange={(e) => write(setColor(stops, sel, e.target.value))}
            />
            <button
              type="button"
              className={stops[sel].hard ? 'dr-on' : ''}
              aria-pressed={stops[sel].hard}
              title="Twardy stop: kolor bez przejścia do następnego"
              onClick={() => write(toggleHard(stops, sel))}
            >
              Step
            </button>
            <button
              type="button"
              disabled={stops.length <= 2}
              onClick={() => {
                write(removeStop(stops, sel))
                setSelected(null)
              }}
            >
              Usuń
            </button>
          </span>
        )}
      </div>
      <div
        ref={bar}
        className="dr-grad-bar"
        style={{ background: cssGradient(stops) }}
        title="Kliknij, żeby dodać stop"
        onPointerDown={onBarDown}
      >
        {stops.map((s, i) => (
          <button
            key={i}
            type="button"
            className={`dr-stop ${i === sel ? 'dr-on' : ''} ${s.hard ? 'dr-hard' : ''}`}
            style={{ left: `${s.pos * 100}%`, background: s.color }}
            aria-label={`Stop ${Math.round(s.pos * 100)}%`}
            onPointerDown={(e) => onStopDown(e, i)}
            onPointerMove={onStopMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          />
        ))}
      </div>
      <div className="dr-presets">
        {PRESET_CSS.map((p) => (
          <button
            key={p.name}
            type="button"
            className={`dr-preset ${p.value === value ? 'dr-on' : ''}`}
            title={p.name}
            aria-label={`Preset ${p.name}`}
            style={{ background: p.css }}
            onClick={() => {
              setParamValue(nodeId, paramKey, p.value)
              setSelected(null)
            }}
          />
        ))}
      </div>
    </div>
  )
}
