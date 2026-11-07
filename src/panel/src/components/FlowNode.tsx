// Wygląd node'a w edytorze: wejścia po lewej, wyjścia po prawej.
// Fiolet = obraz, cyjan = sygnał (audio, LFO, Math).

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { NODE_DEFS, VIDEO_IN, VIDEO_OUT } from '@shared/nodes'
import type { GraphNode } from '@shared/types'
import { usePanel } from '../store'

export type VzNode = Node<{ node: GraphNode }, 'vz'>

const VIDEO = '#a78bfa'
const SIGNAL = '#22d3ee'

const header = {
  source: 'bg-emerald-700',
  filter: 'bg-violet-700',
  control: 'bg-cyan-800',
  output: 'bg-amber-700'
} as const

function Row({
  label,
  value,
  input,
  output,
  color
}: {
  label: string
  value?: string
  input?: string
  output?: string
  color: string
}): React.JSX.Element {
  return (
    <div
      className={`relative flex items-center justify-between gap-2 px-3 py-0.5 ${output ? 'flex-row-reverse' : ''}`}
    >
      {input && (
        <Handle
          type="target"
          position={Position.Left}
          id={input}
          style={{ background: color, left: -5 }}
        />
      )}
      <span className="text-neutral-300">{label}</span>
      {value !== undefined && <span className="tabular-nums text-neutral-500">{value}</span>}
      {output && (
        <Handle
          type="source"
          position={Position.Right}
          id={output}
          style={{ background: color, right: -5 }}
        />
      )}
    </div>
  )
}

function format(v: unknown): string {
  if (typeof v === 'number')
    return Number.isInteger(v) ? String(v) : v.toFixed(Math.abs(v) < 0.1 ? 4 : 2)
  if (typeof v === 'boolean') return v ? 'tak' : 'nie'
  if (v === null) return 'aktywne'
  return String(v).slice(0, 10)
}

export function FlowNode({ data, selected }: NodeProps<VzNode>): React.JSX.Element {
  const node = data.node
  const def = NODE_DEFS[node.type]
  const deleteMode = usePanel((s) => s.graphMode === 'delete')
  const border = deleteMode
    ? node.type === 'Output'
      ? 'cursor-not-allowed border-neutral-700'
      : 'cursor-pointer border-neutral-700 hover:border-red-500 hover:ring-2 hover:ring-red-500/60'
    : selected
      ? 'border-white'
      : 'border-neutral-700'
  return (
    <div
      className={`w-52 overflow-visible rounded-md border bg-neutral-900 text-[11px] shadow-lg ${border} ${
        node.bypass ? 'opacity-50' : ''
      }`}
      title={
        deleteMode
          ? node.type === 'Output'
            ? 'Wyjścia nie można usunąć'
            : 'Kliknij, żeby usunąć'
          : undefined
      }
    >
      <div
        className={`rounded-t-md px-3 py-1 text-xs font-semibold text-white ${header[def.category]}`}
      >
        {def.label}
        <span className="ml-2 font-normal text-white/60">{node.id}</span>
      </div>
      <div className="py-1">
        {def.videoIn && <Row label="obraz" input={VIDEO_IN} color={VIDEO} />}
        {def.signalIn.map((port) => (
          <Row key={port} label={port} input={port} color={SIGNAL} />
        ))}
        {def.params.map((p) => (
          <Row
            key={p.key}
            label={p.label}
            value={format(node.params[p.key])}
            input={p.kind === 'number' ? p.key : undefined}
            color={SIGNAL}
          />
        ))}
        {def.videoOut && <Row label="obraz" output={VIDEO_OUT} color={VIDEO} />}
        {def.signalOut.map((port) => (
          <Row key={port} label={port} output={port} color={SIGNAL} />
        ))}
      </div>
    </div>
  )
}
