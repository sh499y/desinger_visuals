// Edytor node'ów (React Flow): źródła → filtry → wyjście, kable sygnałów → parametry.
// Dwa tryby: „Łączenie i dodawanie” oraz „Usuwanie” (kliknięcie usuwa node albo kabel).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnBeforeDelete
} from '@xyflow/react'
import {
  addNode,
  canConnect,
  connect,
  createNode,
  disconnect,
  edgeKind,
  splitPort,
  updateNode
} from '@shared/graph'
import { NODE_DEFS, NODE_TYPES, type NodeCategory } from '@shared/nodes'
import type { Graph } from '@shared/types'
import {
  commitGraph,
  defaultBinding,
  deleteFromGraph,
  selectNode,
  setBypass,
  setGraphLocal,
  setGraphMode,
  usePanel,
  type GraphMode
} from '../store'
import { FlowNode, type VzNode } from './FlowNode'
import { NodeCard } from './NodeCard'
import { Button } from './ui'

const nodeTypes = { vz: FlowNode }
const current = (): Graph => usePanel.getState().app!.graph

const GROUPS: { category: NodeCategory; label: string }[] = [
  { category: 'source', label: 'Źródła' },
  { category: 'filter', label: 'Filtry' },
  { category: 'control', label: 'Sterowanie' }
]

const MODES: { id: GraphMode; label: string; active: string }[] = [
  { id: 'edit', label: '✎ Łączenie i dodawanie', active: 'bg-violet-600 text-white' },
  { id: 'delete', label: '🗑 Usuwanie', active: 'bg-red-600 text-white' }
]

function ModeSwitch({ mode }: { mode: GraphMode }): React.JSX.Element {
  return (
    <div className="flex overflow-hidden rounded border border-neutral-700" role="radiogroup">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={mode === m.id}
          onClick={() => setGraphMode(m.id)}
          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
            mode === m.id
              ? m.active
              : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

function Toolbar({
  container,
  mode
}: {
  container: React.RefObject<HTMLDivElement | null>
  mode: GraphMode
}): React.JSX.Element {
  const flow = useReactFlow()
  const add = (type: (typeof NODE_TYPES)[number]): void => {
    const rect = container.current?.getBoundingClientRect()
    const center = rect
      ? flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 }
    const graph = current()
    const node = createNode(graph, type, { x: center.x - 104, y: center.y - 60 })
    commitGraph(addNode(graph, node))
    selectNode(node.id)
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 px-3 py-2">
      <ModeSwitch mode={mode} />
      {mode === 'edit' ? (
        GROUPS.map((g) => (
          <div key={g.category} className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">{g.label}</span>
            {NODE_TYPES.filter((t) => NODE_DEFS[t].category === g.category).map((t) => (
              <Button key={t} onClick={() => add(t)}>
                + {NODE_DEFS[t].label}
              </Button>
            ))}
          </div>
        ))
      ) : (
        <span className="text-xs text-red-300">
          Kliknij node albo kabel, żeby go usunąć. Usunięcie filtra łączy jego sąsiadów. Esc –
          powrót do łączenia.
        </span>
      )}
    </div>
  )
}

function Inspector(): React.JSX.Element {
  const node = usePanel((s) => s.app?.graph.nodes.find((n) => n.id === s.selected))
  if (!node) {
    return (
      <p className="p-3 text-xs text-neutral-500">
        Kliknij node, żeby edytować parametry. Przeciągnij od kółka wyjścia do wejścia, żeby
        połączyć. Cyjanowe kable to sygnały (audio, LFO), fioletowe – obraz. Żeby usuwać elementy,
        przełącz tryb na „Usuwanie”.
      </p>
    )
  }
  const def = NODE_DEFS[node.type]
  return (
    <div className="p-3">
      <NodeCard
        node={node}
        actions={
          def.category === 'filter' && (
            <Button
              variant={node.bypass ? 'default' : 'primary'}
              onClick={() => setBypass(node.id, !node.bypass)}
            >
              {node.bypass ? 'wył.' : 'wł.'}
            </Button>
          )
        }
      />
    </div>
  )
}

const toRefs = (c: Connection | Edge): { from: string; to: string } => ({
  from: `${c.source}.${c.sourceHandle ?? ''}`,
  to: `${c.target}.${c.targetHandle ?? ''}`
})

function Editor(): React.JSX.Element {
  const graph = usePanel((s) => s.app!.graph)
  const selected = usePanel((s) => s.selected)
  const mode = usePanel((s) => s.graphMode)
  const deleting = mode === 'delete'
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const container = useRef<HTMLDivElement>(null)

  // Esc wraca z trybu usuwania.
  useEffect(() => {
    if (!deleting) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setGraphMode('edit')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleting])

  const nodes = useMemo<VzNode[]>(
    () =>
      graph.nodes.map((n, i) => ({
        id: n.id,
        type: 'vz',
        position: n.position ?? { x: i * 240, y: 0 },
        data: { node: n },
        selected: !deleting && n.id === selected,
        deletable: n.type !== 'Output'
      })),
    [graph, selected, deleting]
  )

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e) => {
        const f = splitPort(e.from)
        const t = splitPort(e.to)
        const signal = edgeKind(graph, e) === 'signal'
        const active = !deleting && e.to === selectedEdge
        return {
          id: e.to,
          source: f.node,
          sourceHandle: f.port,
          target: t.node,
          targetHandle: t.port,
          animated: signal,
          selected: active,
          className: deleting ? 'vz-edge-delete' : undefined,
          interactionWidth: deleting ? 24 : 20,
          label:
            signal && (e.scale !== undefined || e.offset !== undefined)
              ? `×${e.scale ?? 1} +${e.offset ?? 0}`
              : undefined,
          labelStyle: { fill: '#a3a3a3', fontSize: 10 },
          labelBgStyle: { fill: '#171717' },
          style: { stroke: signal ? '#22d3ee' : '#a78bfa', strokeWidth: active ? 3 : 2 }
        }
      }),
    [graph, selectedEdge, deleting]
  )

  // Klawisz Delete/Backspace obsługujemy sami (naprawa łańcucha obrazu);
  // `false` zatrzymuje domyślne usuwanie React Flow.
  const onBeforeDelete = useCallback<OnBeforeDelete<VzNode>>(async ({ nodes, edges }) => {
    deleteFromGraph(
      nodes.map((n) => n.id),
      edges.map((e) => e.id)
    )
    setSelectedEdge(null)
    return false
  }, [])

  const onNodesChange = useCallback((changes: NodeChange<VzNode>[]) => {
    let g = current()
    for (const c of changes) {
      if (c.type === 'position' && c.position) {
        g = updateNode(g, c.id, { position: c.position })
      } else if (c.type === 'select') {
        if (c.selected) selectNode(c.id)
        else if (usePanel.getState().selected === c.id) selectNode(null)
      }
    }
    if (g !== current()) setGraphLocal(g)
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const c of changes) {
      if (c.type === 'select') setSelectedEdge(c.selected ? c.id : null)
    }
  }, [])

  const onConnect = useCallback((c: Connection) => {
    const g = current()
    const { from, to } = toRefs(c)
    const edge =
      edgeKind(g, { from, to }) === 'signal' ? { from, to, ...defaultBinding(g, to) } : { from, to }
    commitGraph(connect(g, edge))
  }, [])

  const isValidConnection = useCallback((c: Connection | Edge) => {
    const g = current()
    const { from, to } = toRefs(c)
    // Zajęte wejście też jest OK: nowy kabel zastąpi stary.
    return canConnect(disconnect(g, to), from, to)
  }, [])

  return (
    <div className="flex h-full min-h-[32rem] flex-col lg:flex-row">
      <div className="flex min-h-[28rem] flex-1 flex-col">
        <Toolbar container={container} mode={mode} />
        <div
          ref={container}
          className={`relative flex-1 ${deleting ? 'ring-2 ring-inset ring-red-600/50' : ''}`}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            nodesConnectable={!deleting}
            nodesDraggable={!deleting}
            elementsSelectable={!deleting}
            onNodeClick={(_e, node) => deleting && deleteFromGraph([node.id])}
            onEdgeClick={(_e, edge) => deleting && deleteFromGraph([], [edge.id])}
            onNodeDragStop={() => commitGraph(current())}
            onPaneClick={() => selectNode(null)}
            onBeforeDelete={onBeforeDelete}
            deleteKeyCode={['Backspace', 'Delete']}
            colorMode="dark"
            fitView
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} />
            <Controls />
            <MiniMap pannable zoomable className="!bg-neutral-900" />
          </ReactFlow>
        </div>
      </div>
      <aside className="w-full shrink-0 overflow-y-auto border-neutral-800 lg:w-80 lg:border-l">
        <Inspector />
      </aside>
    </div>
  )
}

export function NodeEditor(): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  )
}
