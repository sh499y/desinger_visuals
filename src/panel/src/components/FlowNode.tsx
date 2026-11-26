// Wygląd node'a w edytorze: wejścia po lewej, wyjścia po prawej.
// Ciągły kabel = obraz, kropkowany = sygnał (audio, LFO, Math);
// pełny kwadrat = obraz, pusty = sygnał (ramka w kolorze pasma audio).

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { NODE_DEFS, VIDEO_IN, VIDEO_OUT } from '@shared/nodes'
import type { GraphNode } from '@shared/types'
import { CATEGORY_TAG, lineVar, portColor } from '../palette'
import { usePanel } from '../store'
import { CrtNode } from './crt/CrtNode'
import { isCrtType } from './crt/knobMath'

export type VzNode = Node<{ node: GraphNode }, 'vz'>

type Kind = 'video' | 'signal'

function Row({
  label,
  value,
  input,
  output,
  kind,
  color
}: {
  label: string
  value?: string
  input?: string
  output?: string
  kind: Kind
  /** Ramka uchwytu sygnału (kolor pasma audio). */
  color?: string
}): React.JSX.Element {
  const handleClass = kind === 'video' ? 'vz-handle-video' : 'vz-handle-signal'
  const style = color ? ({ '--handle-color': color } as React.CSSProperties) : undefined
  return (
    <div
      className={`relative flex items-center justify-between gap-2 px-3 leading-5 ${output ? 'flex-row-reverse' : ''}`}
    >
      {input && (
        <Handle
          type="target"
          position={Position.Left}
          id={input}
          className={handleClass}
          style={style}
        />
      )}
      <span className="truncate">{label}</span>
      {value !== undefined && <span className="font-mono tabular-nums text-muted">{value}</span>}
      {output && (
        <Handle
          type="source"
          position={Position.Right}
          id={output}
          className={handleClass}
          style={style}
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
  if (isCrtType(data.node.type)) {
    return <CrtNode node={data.node} selected={selected} />
  }
  return <ListNode node={data.node} selected={selected} />
}

function ListNode({ node, selected }: { node: GraphNode; selected: boolean }): React.JSX.Element {
  const def = NODE_DEFS[node.type]
  const deleteMode = usePanel((s) => s.graphMode === 'delete')
  const frame = deleteMode
    ? node.type === 'Output'
      ? 'cursor-not-allowed border-muted'
      : 'cursor-pointer border-muted vz-node-delete'
    : selected
      ? 'border-term-bright-white'
      : 'border-muted'
  return (
    <div
      className={`w-52 overflow-visible border bg-black text-meta ${frame} ${
        node.bypass ? 'text-muted' : ''
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
        className={`flex items-center gap-2 border-b border-dotted px-3 py-1 ${selected && !deleteMode ? 'inv' : ''}`}
      >
        <span className="min-w-0 flex-1 truncate font-pixel text-ui">{def.label}</span>
        <span className="font-mono text-muted">{node.id}</span>
        <span className="tag">{CATEGORY_TAG[def.category]}</span>
      </div>
      <div className="py-1">
        {def.videoIn && <Row label="obraz" input={VIDEO_IN} kind="video" />}
        {def.signalIn.map((port) => (
          <Row key={port} label={port} input={port} kind="signal" />
        ))}
        {def.params.map((p) => (
          <Row
            key={p.key}
            label={p.label}
            value={format(node.params[p.key])}
            input={p.kind === 'number' ? p.key : undefined}
            kind="signal"
          />
        ))}
        {def.videoOut && <Row label="obraz" output={VIDEO_OUT} kind="video" />}
        {def.signalOut.map((port) => (
          <Row
            key={port}
            label={port}
            output={port}
            kind="signal"
            color={lineVar(portColor(node.type, port))}
          />
        ))}
      </div>
    </div>
  )
}
