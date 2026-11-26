// Prosty widok: łańcuch źródło → filtry → wyjście jako bloki z suwakami.
// Numer `NN /` w nagłówku bloku pokazuje pozycję w łańcuchu.

import { addNode, appendFilter, createNode, getChain, moveInChain, removeNode } from '@shared/graph'
import { FILTER_TYPES, NODE_DEFS, type NodeType } from '@shared/nodes'
import { commitGraph, setBypass, usePanel } from '../store'
import { BINDING_FORMULA, NodeCard } from './NodeCard'
import { AsciiBox, Button, ToggleTag } from './ui'

const CONTROL_TYPES: NodeType[] = ['AudioIn', 'LFO', 'Math', 'MPC']

export function EffectsView(): React.JSX.Element {
  const graph = usePanel((s) => s.app!.graph)
  const chain = getChain(graph)
  const controls = graph.nodes.filter((n) => NODE_DEFS[n.type].category === 'control')
  const offset = chain.source ? 2 : 1

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="min-w-0">
        <h3 className="mb-3 font-display text-display">Łańcuch obrazu</h3>
        <div className="space-y-6">
          {chain.source ? (
            <NodeCard node={chain.source} index={1} />
          ) : (
            <div className="dither-12 border p-1">
              <p className="bg-black px-2 py-1">
                Łańcuch nie ma źródła wideo. Podłącz node „Wideo” w zakładce Graf.
              </p>
            </div>
          )}

          {chain.filters.map((node, i) => (
            <NodeCard
              key={node.id}
              node={node}
              index={i + offset}
              actions={
                <>
                  <ToggleTag
                    on={!node.bypass}
                    title="Włącz / wyłącz efekt"
                    onToggle={() => setBypass(node.id, !node.bypass)}
                  />
                  <Button
                    variant="link"
                    title="Wyżej"
                    disabled={i === 0}
                    onClick={() => commitGraph(moveInChain(graph, node.id, -1))}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="link"
                    title="Niżej"
                    disabled={i === chain.filters.length - 1}
                    onClick={() => commitGraph(moveInChain(graph, node.id, 1))}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="link"
                    className="btn-danger"
                    title="Usuń efekt"
                    onClick={() => commitGraph(removeNode(graph, node.id, true))}
                  >
                    ×
                  </Button>
                </>
              }
            />
          ))}

          <select
            className="select-btn"
            aria-label="Dodaj efekt"
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

          {chain.output && <NodeCard node={chain.output} index={chain.filters.length + offset} />}
        </div>
      </div>

      <div className="min-w-0">
        <h3 className="font-display text-display">Sterowanie</h3>
        <p className="mt-2 text-muted">
          Źródła sygnałów do podpinania pod parametry (przycisk <span className="tag">~</span> obok
          wartości). Podpięty parametr: {BINDING_FORMULA}.
        </p>
        {controls.length === 0 ? (
          <div className="mt-3">
            <AsciiBox>Brak źródeł sygnału. Dodaj Audio, LFO albo Math.</AsciiBox>
          </div>
        ) : (
          <div className="mt-3 space-y-6">
            {controls.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                actions={
                  <Button
                    variant="link"
                    className="btn-danger"
                    title="Usuń"
                    onClick={() => commitGraph(removeNode(graph, node.id))}
                  >
                    ×
                  </Button>
                }
              />
            ))}
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
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
