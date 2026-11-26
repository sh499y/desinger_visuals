// Node'y Dreamera (Blur, Ziarno, Gradient) i Wygładzania w edytorze grafu: budowa jak CRT
// (jack nad każdym pokrętłem, wideo bokami, footswitch = bypass), skórka z różowego,
// anodyzowanego aluminium, a na listwie z nazwą własny gradient noda z presetów LightCrafta.

import { Handle, Position } from '@xyflow/react'
import { parseGradient, presetValue } from '@shared/gradient'
import { NODE_DEFS, VIDEO_IN, VIDEO_OUT } from '@shared/nodes'
import type { GraphNode } from '@shared/types'
import { setBypass, setParamValue, usePanel } from '../../store'
import { Column, Jacks } from '../crt/CrtNode'
import { useKnobs } from '../crt/useKnobs'
import '../crt/crt.css'
import './dreamer.css'
import { GradientBar } from './GradientBar'
import { cssGradient } from './gradientEdit'
import { DREAMER_TYPES, NODE_GRADIENT, isDreamerType, type DreamerType } from './dreamerTypes'

const TITLES: Record<DreamerType, { name: string; sub: string }> = {
  DreamerBlur: { name: 'Dreamer Blur', sub: 'gaussian · motion · spin · zoom · band · ellipse' },
  DreamerGrain: { name: 'Dreamer Ziarno', sub: 'grain · screens · motion' },
  DreamerGradient: { name: 'Dreamer Gradient', sub: 'map A ↔ B' },
  Smooth: { name: 'Wygładzanie', sub: 'attack · release' }
}

const SHORT: Record<string, string> = {
  amount: 'Siła',
  angle: 'Kąt',
  centerX: 'Śr. X',
  centerY: 'Śr. Y',
  focus: 'Ostrość',
  feather: 'Miękk.',
  size: 'Rozmiar',
  softness: 'Miękk.',
  shadows: 'Cienie',
  highlights: 'Światła',
  motion: 'Ruch',
  mix: 'A ↔ B',
  shift: 'Shift',
  contrast: 'Kontr.',
  steps: 'Schodki',
  opacity: 'Krycie',
  attack: 'Atak',
  release: 'Zwoln.'
}

const LED = '#ff5fa2'
const STRIP = Object.fromEntries(
  DREAMER_TYPES.map((t) => [t, cssGradient(parseGradient(presetValue(NODE_GRADIENT[t])) ?? [])])
) as Record<DreamerType, string>

export function DreamerNode({
  node,
  selected
}: {
  node: GraphNode
  selected: boolean
}): React.JSX.Element {
  const deleteMode = usePanel((s) => s.graphMode === 'delete')
  const knobs = useKnobs(node)
  const type = isDreamerType(node.type) ? node.type : 'DreamerBlur'
  const def = NODE_DEFS[type]
  const title = TITLES[type]
  const on = !node.bypass
  const control = def.category === 'control'
  const width = Math.max(control ? 190 : 250, knobs.length * 62 + 28)

  return (
    <div
      className={`crt-node dr-node ${node.bypass ? 'crt-bypassed' : ''} ${
        selected && !deleteMode ? 'crt-selected' : ''
      } ${deleteMode ? 'crt-deletable' : ''}`}
      style={{ width }}
      title={deleteMode ? 'Kliknij, żeby usunąć' : `${title.name} · ${node.id}`}
    >
      {def.videoIn && (
        <Handle type="target" position={Position.Left} id={VIDEO_IN} className="crt-video" />
      )}
      {def.videoOut && (
        <Handle type="source" position={Position.Right} id={VIDEO_OUT} className="crt-video" />
      )}
      {def.signalIn.map((port) => (
        <Handle
          key={port}
          type="target"
          position={Position.Left}
          id={port}
          className="dr-signal"
          title={port}
        />
      ))}
      {def.signalOut.map((port) => (
        <Handle
          key={port}
          type="source"
          position={Position.Right}
          id={port}
          className="dr-signal"
          title={port}
        />
      ))}
      <Jacks knobs={knobs} />
      <div className="dr-body">
        <div className="dr-plate">
          {def.params.some((p) => p.kind === 'select' || p.kind === 'boolean') && (
            <div className="dr-switches">
              {def.params.map((p) => {
                if (p.kind === 'select') {
                  const v = node.params[p.key]
                  return (
                    <select
                      key={p.key}
                      className="dr-select nodrag"
                      aria-label={p.label}
                      value={typeof v === 'number' ? v : p.default}
                      onChange={(e) => setParamValue(node.id, p.key, Number(e.target.value))}
                    >
                      {p.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )
                }
                if (p.kind === 'boolean') {
                  const v = node.params[p.key] === true
                  return (
                    <button
                      key={p.key}
                      type="button"
                      className={`dr-toggle nodrag ${v ? 'dr-on' : ''}`}
                      aria-pressed={v}
                      onClick={(e) => {
                        e.stopPropagation()
                        setParamValue(node.id, p.key, !v)
                      }}
                    >
                      {p.label}
                    </button>
                  )
                }
                return null
              })}
            </div>
          )}
          <div className="dr-row">
            {knobs.map((k) => (
              <Column
                key={k.def.key}
                nodeId={node.id}
                k={k}
                ledAlways={false}
                short={SHORT[k.def.key]}
                led={LED}
              />
            ))}
          </div>
          {def.params.map((p) =>
            p.kind === 'gradient' ? (
              <GradientBar
                key={p.key}
                nodeId={node.id}
                paramKey={p.key}
                label={p.label}
                value={
                  typeof node.params[p.key] === 'string'
                    ? (node.params[p.key] as string)
                    : p.default
                }
              />
            ) : null
          )}
        </div>
        <div className="dr-foot-row">
          <div className="dr-strip" style={{ background: STRIP[type] }}>
            <div className="dr-name">{title.name}</div>
            <div className="dr-sub">{title.sub}</div>
          </div>
          {!control && (
            <div className="dr-foot">
              <span className={`crt-status dr-status ${on ? 'crt-on' : ''}`} />
              <button
                type="button"
                className="crt-foot dr-footswitch nodrag"
                title={on ? 'Wyłącz (bypass)' : 'Włącz'}
                aria-pressed={on}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!deleteMode) setBypass(node.id, on)
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
