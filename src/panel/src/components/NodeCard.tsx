// Blok node'a z parametrami. Używany w widoku „Efekty” i w inspektorze grafu.
// Nagłówek `NN / NAZWA [FX] id`, pod nim wszystkie parametry pod jedną lewą linią.

import { GRADIENT_PRESETS } from '@shared/gradient'
import type { ReactNode } from 'react'
import { connect, disconnect, incomingEdge, portRef, updateEdge } from '@shared/graph'
import { NODE_DEFS, type ParamDef } from '@shared/nodes'
import type { Graph, GraphNode } from '@shared/types'
import { CATEGORY_TAG, signalColor, textVar } from '../palette'
import { commitGraph, defaultBinding, setParamValue, usePanel } from '../store'
import { Button, NumberField, Slider, Tag, selectClass } from './ui'

/** Formuła podpiętego sygnału, pokazywana w `title` pól i raz w „Sterowaniu”. */
export const BINDING_FORMULA = 'wartość = sygnał × skala + offset'

/** Wszystkie wyjścia sygnałów w grafie, np. „Audio (a1) / bass”. */
function signalSources(graph: Graph, exclude: string): { ref: string; label: string }[] {
  return graph.nodes
    .filter((n) => n.id !== exclude)
    .flatMap((n) =>
      NODE_DEFS[n.type].signalOut.map((port) => ({
        ref: portRef(n.id, port),
        label: `${NODE_DEFS[n.type].label} (${n.id}) / ${port}`
      }))
    )
}

function ParamRow({
  node,
  def,
  graph
}: {
  node: GraphNode
  def: ParamDef
  graph: Graph
}): React.JSX.Element {
  const library = usePanel((s) => s.app?.library ?? [])
  const value = node.params[def.key]

  if (def.kind === 'boolean') {
    return (
      <label className="tap flex items-center gap-2 text-muted">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => setParamValue(node.id, def.key, e.target.checked)}
        />
        {def.label}
      </label>
    )
  }

  if (def.kind === 'select') {
    return (
      <label className="block text-muted">
        {def.label}
        <select
          className={`${selectClass} text-fg`}
          value={typeof value === 'number' ? value : def.default}
          onChange={(e) => setParamValue(node.id, def.key, Number(e.target.value))}
        >
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (def.kind === 'gradient') {
    const current = typeof value === 'string' ? value : def.default
    const preset = GRADIENT_PRESETS.find((p) => p.value === current)
    return (
      <label className="block text-muted">
        {def.label}
        <select
          className={`${selectClass} text-fg`}
          value={preset ? preset.value : ''}
          onChange={(e) => e.target.value && setParamValue(node.id, def.key, e.target.value)}
        >
          {!preset && <option value="">Własny</option>}
          {GRADIENT_PRESETS.map((p) => (
            <option key={p.name} value={p.value}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (def.kind === 'video') {
    return (
      <label className="block text-muted">
        {def.label}
        <select
          className={`${selectClass} text-fg`}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => setParamValue(node.id, def.key, e.target.value || null)}
        >
          <option value="">Aktywne wideo z biblioteki</option>
          {library.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
    )
  }

  const to = portRef(node.id, def.key)
  const edge = incomingEdge(graph, to)
  const sources = signalSources(graph, node.id)

  // Podpięty: wiersz 1 = etykieta + źródło + odepnij, wiersz 2 = skala, offset, zakres.
  if (edge) {
    const source = sources.find((s) => s.ref === edge.from)
    return (
      <div>
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="text-muted">{def.label}</span>
          <span
            className="min-w-0 break-all"
            style={{ color: textVar(signalColor(graph, edge.from)) }}
          >
            {'<-'} {source?.label ?? edge.from}
          </span>
          <Button
            variant="link"
            className="ml-auto"
            onClick={() => commitGraph(disconnect(graph, to))}
          >
            odepnij
          </Button>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <NumberField
            label="×"
            step={0.05}
            title={`Skala: ${BINDING_FORMULA}`}
            value={edge.scale ?? 1}
            onChange={(scale) => commitGraph(updateEdge(graph, to, { scale }))}
          />
          <NumberField
            label="+"
            step={0.01}
            title={`Offset: ${BINDING_FORMULA}`}
            value={edge.offset ?? 0}
            onChange={(offset) => commitGraph(updateEdge(graph, to, { offset }))}
          />
          <span className="text-muted" title="Zakres parametru">
            {def.min}…{def.max}
          </span>
        </div>
      </div>
    )
  }

  return (
    <Slider
      label={def.label}
      value={typeof value === 'number' ? value : def.default}
      min={def.min}
      max={def.max}
      step={def.step}
      onChange={(v) => setParamValue(node.id, def.key, v)}
      extra={
        sources.length > 0 && (
          <select
            className="sig-select"
            title="podepnij sygnał"
            aria-label={`Podepnij sygnał pod: ${def.label}`}
            value=""
            onChange={(e) => {
              const from = e.target.value
              if (from) commitGraph(connect(graph, { from, to, ...defaultBinding(graph, to) }))
            }}
          >
            <option value="">~</option>
            {sources.map((s) => (
              <option
                key={s.ref}
                value={s.ref}
                style={{ color: textVar(signalColor(graph, s.ref)) }}
              >
                {s.label}
              </option>
            ))}
          </select>
        )
      }
    />
  )
}

export function NodeCard({
  node,
  index,
  actions
}: {
  node: GraphNode
  /** Pozycja w łańcuchu: nagłówek `02 / GLITCH`. */
  index?: number
  actions?: ReactNode
}): React.JSX.Element {
  const graph = usePanel((s) => s.app!.graph)
  const def = NODE_DEFS[node.type]
  const signalInputs = def.signalIn.map((port) => {
    const edge = incomingEdge(graph, portRef(node.id, port))
    return (
      <div key={port} className="text-muted">
        wejście {port}:{' '}
        {edge ? (
          <span style={{ color: textVar(signalColor(graph, edge.from)) }}>
            {'<-'} {edge.from}
          </span>
        ) : (
          'niepodłączone'
        )}
      </div>
    )
  })

  return (
    <div className={`border-t border-line-dim pt-3 ${node.bypass ? 'is-off' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h4 className="min-w-0 truncate font-pixel text-title text-fg uppercase">
          {index !== undefined && `${String(index).padStart(2, '0')} / `}
          {def.label}
        </h4>
        <Tag className="text-muted">{CATEGORY_TAG[def.category]}</Tag>
        <span className="text-meta text-muted">{node.id}</span>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-1">{actions}</div>}
      </div>
      {(def.params.length > 0 || signalInputs.length > 0) && (
        <div className="mt-3 space-y-3 border-l border-line-dim pl-3">
          {signalInputs}
          {def.params.map((p) => (
            <ParamRow key={p.key} node={node} def={p} graph={graph} />
          ))}
        </div>
      )}
    </div>
  )
}
