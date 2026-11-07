// Karta node'a z parametrami. Używana w widoku „Efekty” i w inspektorze grafu.

import type { ReactNode } from 'react'
import { connect, disconnect, incomingEdge, portRef, updateEdge } from '@shared/graph'
import { NODE_DEFS, type ParamDef } from '@shared/nodes'
import type { Graph, GraphNode } from '@shared/types'
import { commitGraph, defaultBinding, setParamValue, usePanel } from '../store'
import { Button, NumberField, Slider, selectClass } from './ui'

const categoryColor = {
  source: 'border-l-emerald-500',
  filter: 'border-l-violet-500',
  control: 'border-l-cyan-500',
  output: 'border-l-amber-500'
} as const

/** Wszystkie wyjścia sygnałów w grafie, np. „Audio (a1) · bass”. */
function signalSources(graph: Graph, exclude: string): { ref: string; label: string }[] {
  return graph.nodes
    .filter((n) => n.id !== exclude)
    .flatMap((n) =>
      NODE_DEFS[n.type].signalOut.map((port) => ({
        ref: portRef(n.id, port),
        label: `${NODE_DEFS[n.type].label} (${n.id}) · ${port}`
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
      <label className="flex items-center gap-2 text-xs text-neutral-300">
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
      <label className="block text-xs text-neutral-400">
        {def.label}
        <select
          className={selectClass}
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

  if (def.kind === 'video') {
    return (
      <label className="block text-xs text-neutral-400">
        {def.label}
        <select
          className={selectClass}
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

  if (edge) {
    const source = sources.find((s) => s.ref === edge.from)
    return (
      <div className="rounded border border-cyan-900/60 bg-cyan-950/20 p-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-neutral-300">{def.label}</span>
          <Button variant="ghost" onClick={() => commitGraph(disconnect(graph, to))}>
            odepnij
          </Button>
        </div>
        <div className="mb-1 text-xs text-cyan-300">← {source?.label ?? edge.from}</div>
        <div className="flex flex-wrap gap-2">
          <NumberField
            label="×"
            step={0.05}
            value={edge.scale ?? 1}
            onChange={(scale) => commitGraph(updateEdge(graph, to, { scale }))}
          />
          <NumberField
            label="+"
            step={0.01}
            value={edge.offset ?? 0}
            onChange={(offset) => commitGraph(updateEdge(graph, to, { offset }))}
          />
        </div>
        <div className="mt-1 text-[10px] text-neutral-500">
          wartość = sygnał × skala + offset, w zakresie {def.min}…{def.max}
        </div>
      </div>
    )
  }

  return (
    <div>
      <Slider
        label={def.label}
        value={typeof value === 'number' ? value : def.default}
        min={def.min}
        max={def.max}
        step={def.step}
        onChange={(v) => setParamValue(node.id, def.key, v)}
      />
      {sources.length > 0 && (
        <select
          className="mt-0.5 w-full rounded bg-transparent text-[11px] text-neutral-500 hover:text-cyan-300"
          value=""
          onChange={(e) => {
            const from = e.target.value
            if (from) commitGraph(connect(graph, { from, to, ...defaultBinding(graph, to) }))
          }}
        >
          <option value="">⚡ podepnij sygnał…</option>
          {sources.map((s) => (
            <option key={s.ref} value={s.ref}>
              {s.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export function NodeCard({
  node,
  actions
}: {
  node: GraphNode
  actions?: ReactNode
}): React.JSX.Element {
  const graph = usePanel((s) => s.app!.graph)
  const def = NODE_DEFS[node.type]
  const signalInputs = def.signalIn.map((port) => {
    const edge = incomingEdge(graph, portRef(node.id, port))
    return (
      <div key={port} className="text-xs text-neutral-400">
        wejście <b>{port}</b>:{' '}
        {edge ? <span className="text-cyan-300">← {edge.from}</span> : 'niepodłączone'}
      </div>
    )
  })

  return (
    <div
      className={`rounded-md border border-neutral-800 border-l-4 bg-neutral-900 ${categoryColor[def.category]} ${node.bypass ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div>
          <div className="text-sm font-medium text-neutral-100">{def.label}</div>
          <div className="text-[10px] text-neutral-500">{node.id}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-1">{actions}</div>
      </div>
      {(def.params.length > 0 || signalInputs.length > 0) && (
        <div className="space-y-2 border-t border-neutral-800 px-3 py-2">
          {signalInputs}
          {def.params.map((p) => (
            <ParamRow key={p.key} node={node} def={p} graph={graph} />
          ))}
        </div>
      )}
    </div>
  )
}
