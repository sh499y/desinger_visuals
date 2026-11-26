// Node'y CRT (Guns, Circuit, Echo, Signal, Tube, Flicker) w edytorze grafu jako analogowe efekty:
// jack nad każdym pokrętłem (wejście sygnału), wideo bokami, footswitch = bypass.

import { Handle, Position } from '@xyflow/react'
import { VIDEO_IN, VIDEO_OUT } from '@shared/nodes'
import type { GraphNode } from '@shared/types'
import { setBypass, usePanel } from '../../store'
import { Knob } from './Knob'
import { isCrtType, knobAngle, modRange, type CrtType } from './knobMath'
import { useKnobs, type KnobState } from './useKnobs'
import './crt.css'

const LABELS: Record<string, { short: string; led?: string }> = {
  red: { short: 'Red', led: '#ff4b3a' },
  green: { short: 'Green', led: '#46e06a' },
  blue: { short: 'Blue', led: '#4b8bff' },
  hv: { short: 'HV' },
  hdef: { short: 'H-Def' },
  vdef: { short: 'V-Def' },
  echo: { short: 'Echo' },
  delay: { short: 'Delay' },
  spread: { short: 'Spread' },
  hum: { short: 'Hum' },
  jitter: { short: 'Jitter' },
  chroma: { short: 'Chroma' },
  glow: { short: 'Glow' },
  contrast: { short: 'Contrast' },
  color: { short: 'Color' },
  amount: { short: 'Amount' },
  rate: { short: 'Rate' },
  tone: { short: 'B / W' }
}

const TITLES = {
  CRTGuns: { name: 'CRT Guns', panel: 'Guns', sub: 'cathode drive' },
  CRTCircuit: { name: 'CRT Circuit', panel: 'Circuit', sub: 'high voltage · yoke' },
  CRTEcho: { name: 'CRT Echo', panel: 'Echo', sub: 'cable reflections' },
  CRTSignal: { name: 'CRT Signal', panel: 'Signal', sub: 'hum · timebase · chroma' },
  CRTTube: { name: 'CRT Tube', panel: 'Tube', sub: 'glass · phosphor' },
  CRTFlicker: { name: 'CRT Flicker', panel: 'Flicker', sub: 'strobe · black / white' }
} as const satisfies Record<CrtType, { name: string; panel: string; sub: string }>

export function Column({
  nodeId,
  k,
  ledAlways,
  short,
  led: ledColor
}: {
  nodeId: string
  k: KnobState
  ledAlways: boolean
  /** Krótka etykieta pod pokrętłem (domyślnie z tabeli CRT albo pełna nazwa). */
  short?: string
  /** Kolor lampki pod pokrętłem. */
  led?: string
}): React.JSX.Element {
  const label = short ? { short } : (LABELS[k.def.key] ?? { short: k.def.label })
  const led = ledColor ?? label.led ?? '#ffb02e'
  const mod = k.edge && modRange(k.edge, k.def)
  return (
    <div className="crt-col">
      <Knob nodeId={nodeId} def={k.def} value={k.value} edge={k.edge} />
      <div className="crt-klab">{label.short}</div>
      {mod && (
        <div className="crt-modread">
          {mod.lo.toFixed(2)}→{mod.hi.toFixed(2)}
        </div>
      )}
      <div
        className={`crt-pin ${ledAlways || k.edge ? 'crt-on' : ''}`}
        style={{ '--led': led } as React.CSSProperties}
      />
    </div>
  )
}

/** Rząd jacków na górnej krawędzi, wyrównany z kolumnami pokręteł. */
export function Jacks({ knobs }: { knobs: KnobState[] }): React.JSX.Element {
  return (
    <div className="crt-jacks">
      {knobs.map((k) => (
        <div key={k.def.key} className="crt-col">
          <Handle
            type="target"
            position={Position.Top}
            id={k.def.key}
            className={`crt-jack ${k.edge ? 'crt-on' : ''}`}
          />
        </div>
      ))}
    </div>
  )
}

function Meter({ value }: { value: number }): React.JSX.Element {
  return (
    <div className="crt-meter">
      <div className="crt-meter-face">
        <svg viewBox="0 0 124 54" aria-hidden>
          <path d="M14 46 A 56 56 0 0 1 110 46" stroke="#3b3527" strokeWidth=".8" fill="none" />
          <path d="M86 26 A 56 56 0 0 1 110 46" stroke="#c0261b" strokeWidth="2" fill="none" />
          <g stroke="#3b3527" strokeWidth=".8">
            <line x1="20" y1="38" x2="16" y2="35" />
            <line x1="34" y1="27" x2="31" y2="23" />
            <line x1="50" y1="21" x2="49" y2="17" />
            <line x1="62" y1="20" x2="62" y2="15" />
            <line x1="74" y1="21" x2="75" y2="17" />
            <line x1="90" y1="27" x2="93" y2="23" />
            <line x1="104" y1="38" x2="108" y2="35" />
          </g>
          <g fontSize="5.5" fill="#3b3527" fontFamily="Futura,sans-serif" textAnchor="middle">
            <text x="13" y="31">
              0
            </text>
            <text x="45" y="13">
              15
            </text>
            <text x="79" y="13">
              25
            </text>
            <text x="112" y="31" fill="#c0261b">
              30
            </text>
          </g>
        </svg>
        <div
          className="crt-needle"
          style={{ transform: `rotate(${(knobAngle(value, 0, 1) * 40) / 135}deg)` }}
        />
        <div className="crt-meter-label">kilovolts</div>
      </div>
    </div>
  )
}

export function CrtNode({
  node,
  selected
}: {
  node: GraphNode
  selected: boolean
}): React.JSX.Element {
  const skin = usePanel((s) => s.crtSkin)
  const deleteMode = usePanel((s) => s.graphMode === 'delete')
  const knobs = useKnobs(node)
  const type = isCrtType(node.type) ? node.type : 'CRTCircuit'
  const title = TITLES[type]
  const guns = type === 'CRTGuns'
  const on = !node.bypass

  const footswitch = (
    <>
      <span className={`crt-status ${on ? 'crt-on' : ''}`} />
      <button
        type="button"
        className="crt-foot nodrag"
        title={on ? 'Wyłącz (bypass)' : 'Włącz'}
        aria-pressed={on}
        onClick={(e) => {
          e.stopPropagation()
          if (!deleteMode) setBypass(node.id, on)
        }}
      />
    </>
  )
  const columns = knobs.map((k) => (
    <Column key={k.def.key} nodeId={node.id} k={k} ledAlways={guns} />
  ))

  return (
    <div
      className={`crt-node crt-${skin} ${node.bypass ? 'crt-bypassed' : ''} ${
        selected && !deleteMode ? 'crt-selected' : ''
      } ${deleteMode ? 'crt-deletable' : ''}`}
      title={deleteMode ? 'Kliknij, żeby usunąć' : `${title.name} · ${node.id}`}
    >
      <Handle type="target" position={Position.Left} id={VIDEO_IN} className="crt-video" />
      <Handle type="source" position={Position.Right} id={VIDEO_OUT} className="crt-video" />
      <Jacks knobs={knobs} />
      {skin === 'hammertone' ? (
        <div className="crt-body">
          <div className="crt-plate">{columns}</div>
          <div className="crt-foot-row">
            <div>
              <div className="crt-name">{title.name}</div>
              <div className="crt-sub">{title.sub}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{footswitch}</div>
          </div>
        </div>
      ) : (
        <div className="crt-body">
          <div className="crt-panel">
            <span className="crt-screw" style={{ left: 5, top: 5 }} />
            <span className="crt-screw" style={{ right: 5, top: 5 }} />
            <span className="crt-screw" style={{ left: 5, bottom: 5 }} />
            <span className="crt-screw" style={{ right: 5, bottom: 5 }} />
            <div className="crt-name">{title.panel}</div>
            {type === 'CRTCircuit' && (
              <Meter value={knobs.find((k) => k.def.key === 'hv')?.value ?? 0.5} />
            )}
            <div className="crt-row">{columns}</div>
            <div className="crt-foot-row">{footswitch}</div>
          </div>
        </div>
      )}
    </div>
  )
}
