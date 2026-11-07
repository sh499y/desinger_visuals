// Prosty widok: łańcuch źródło → filtry → wyjście jako lista kart z suwakami.

import { addNode, appendFilter, createNode, getChain, moveInChain, removeNode } from '@shared/graph'
import { FILTER_TYPES, NODE_DEFS, type NodeType } from '@shared/nodes'
import { commitGraph, setBypass, usePanel } from '../store'
import { NodeCard } from './NodeCard'
import { Button, selectClass } from './ui'

const CONTROL_TYPES: NodeType[] = ['AudioIn', 'LFO', 'Math']

export function EffectsView(): React.JSX.Element {
  const graph = usePanel((s) => s.app!.graph)
  const chain = getChain(graph)
  const controls = graph.nodes.filter((n) => NODE_DEFS[n.type].category === 'control')

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Łańcuch obrazu
        </h3>
        {chain.source ? (
          <NodeCard node={chain.source} />
        ) : (
          <div className="rounded border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-200">
            Łańcuch nie ma źródła wideo. Podłącz node „Wideo” w zakładce Graf.
          </div>
        )}

        {chain.filters.map((node, i) => (
          <NodeCard
            key={node.id}
            node={node}
            actions={
              <>
                <Button
                  variant={node.bypass ? 'default' : 'primary'}
                  title="Włącz / wyłącz efekt"
                  onClick={() => setBypass(node.id, !node.bypass)}
                >
                  {node.bypass ? 'wył.' : 'wł.'}
                </Button>
                <Button
                  variant="ghost"
                  title="Wyżej"
                  disabled={i === 0}
                  onClick={() => commitGraph(moveInChain(graph, node.id, -1))}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  title="Niżej"
                  disabled={i === chain.filters.length - 1}
                  onClick={() => commitGraph(moveInChain(graph, node.id, 1))}
                >
                  ↓
                </Button>
                <Button
                  variant="danger"
                  title="Usuń efekt"
                  onClick={() => commitGraph(removeNode(graph, node.id, true))}
                >
                  ✕
                </Button>
              </>
            }
          />
        ))}

        <select
          className={selectClass}
          value=""
          onChange={(e) =>
            e.target.value && commitGraph(appendFilter(graph, e.target.value as NodeType))
          }
        >
          <option value="">+ dodaj efekt…</option>
          {FILTER_TYPES.map((t) => (
            <option key={t} value={t}>
              {NODE_DEFS[t].label}
            </option>
          ))}
        </select>

        {chain.output && <NodeCard node={chain.output} />}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Sterowanie
        </h3>
        <p className="text-xs text-neutral-500">
          Źródła sygnałów do podpinania pod parametry (⚡ przy suwaku).
        </p>
        {controls.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            actions={
              <Button
                variant="danger"
                title="Usuń"
                onClick={() => commitGraph(removeNode(graph, node.id))}
              >
                ✕
              </Button>
            }
          />
        ))}
        <div className="flex flex-wrap gap-1">
          {CONTROL_TYPES.map((t) => (
            <Button
              key={t}
              onClick={() => {
                const y = 260 + controls.length * 40
                commitGraph(addNode(graph, createNode(graph, t, { x: 240, y })))
              }}
            >
              + {NODE_DEFS[t].label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
