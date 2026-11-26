// Edytor node'ów (React Flow): źródła → filtry → wyjście, kable sygnałów → parametry.
// Dwa tryby: „Łączenie i dodawanie” oraz „Usuwanie” (kliknięcie usuwa node albo kabel).

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type FitViewOptions,
  type NodeChange,
  type OnBeforeDelete,
  type OnConnectEnd,
  type OnConnectStart,
  type OnNodeDrag
} from '@xyflow/react'
import {
  addNode,
  canConnect,
  connect,
  createNode,
  disconnect,
  edgeKind,
  inputKind,
  insertFilter,
  outputKind,
  portRef,
  spliceIntoEdge,
  splitPort,
  updateNode,
  videoLinkToNode,
  type PortKind
} from '@shared/graph'
import { NODE_DEFS, NODE_TYPES, VIDEO_OUT, type NodeCategory } from '@shared/nodes'
import type { Graph } from '@shared/types'
import {
  commitGraph,
  defaultBinding,
  deleteFromGraph,
  selectNode,
  setBypass,
  setCrtSkin,
  setGraphLocal,
  setGraphMode,
  usePanel,
  type CrtSkin,
  type GraphMode
} from '../store'
import { flowSource, isDimmed } from '../flow'
import { startFlow } from '../flowAnim'
import { mergeMeasured, type Measured } from '../measured'
import { lineVar, signalColor } from '../palette'
import { FlowEdge, type VzEdge } from './FlowEdge'
import { FlowNode, type VzNode } from './FlowNode'
import { NodeCard } from './NodeCard'
import { Button, ToggleTag } from './ui'

const nodeTypes = { vz: FlowNode }
const edgeTypes = { vz: FlowEdge }

// Szeroki ekran (lg): panele pływają nad grafem, więc fitView zostawia im miejsce po bokach
// (320px + marginesy) i u góry (pasek narzędzi). minZoom, żeby node'y były czytelne po starcie.
const WIDE = window.matchMedia('(min-width: 64rem)').matches
const FIT_WIDE: FitViewOptions = {
  padding: { left: '344px', right: '344px', top: '140px', bottom: '24px' },
  minZoom: 0.75
}
const FIT_NARROW: FitViewOptions = { padding: 0.1, minZoom: 0.4 }
const current = (): Graph => usePanel.getState().app!.graph
// Wymiary node'a (w-52) i przybliżona wysokość: do centrowania widoku na nowym node'ie.
const NODE_W = 208
const NODE_H = 120

/** Punkt zdarzenia (mysz albo dotyk). Wspólny obiekt, żeby nie alokować przy każdym ruchu. */
const point = { x: 0, y: 0 }
function eventPoint(e: MouseEvent | TouchEvent): typeof point | null {
  if ('changedTouches' in e) {
    const t = e.changedTouches[0]
    if (!t) return null
    point.x = t.clientX
    point.y = t.clientY
  } else {
    point.x = e.clientX
    point.y = e.clientY
  }
  return point
}

/** Czy `ref` ("node.port") należy do node'a `id`. Bez alokacji, bo wołane przy każdym ruchu. */
const ownPort = (ref: string, id: string): boolean =>
  ref.length > id.length && ref.charCodeAt(id.length) === 46 && ref.startsWith(id)

/** Czy `ref` ("node.port") to wyjście obrazu. Bez alokacji. */
const isVideoOut = (ref: string): boolean =>
  ref.endsWith(VIDEO_OUT) && ref.charCodeAt(ref.length - VIDEO_OUT.length - 1) === 46

/**
 * Kabel obrazu pod kursorem przy przeciąganiu node'a `nodeId`: pierwszy `.react-flow__edge`
 * pod spodem, z pominięciem kabli sygnału (mogą przecinać kabel obrazu) i kabli samego
 * node'a (często biegną pod jego korpusem).
 */
function edgeAt(x: number, y: number, nodeId: string, graph: Graph): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const id = el.closest('.react-flow__edge')?.getAttribute('data-id')
    if (!id || ownPort(id, nodeId)) continue
    const from = graph.edges.find((e) => e.to === id)?.from
    if (!from || !isVideoOut(from) || ownPort(from, nodeId)) continue
    return id
  }
  return null
}

/** Łączy porty; kabel sygnału dostaje domyślne skalowanie do zakresu parametru. */
function link(from: string, to: string): void {
  const g = current()
  const edge =
    edgeKind(g, { from, to }) === 'signal' ? { from, to, ...defaultBinding(g, to) } : { from, to }
  commitGraph(connect(g, edge))
}

const GROUPS: { category: NodeCategory; label: string }[] = [
  { category: 'source', label: 'Źródła' },
  { category: 'filter', label: 'Filtry' },
  { category: 'control', label: 'Sterowanie' }
]

const MODES: { id: GraphMode; label: string; active: string }[] = [
  { id: 'edit', label: 'Łączenie', active: 'bg-term-bright-white text-black' },
  { id: 'delete', label: 'Usuwanie', active: 'bg-danger text-black' }
]

function ModeSwitch({ mode }: { mode: GraphMode }): React.JSX.Element {
  return (
    <div className="flex items-center border" role="radiogroup" aria-label="Tryb edytora">
      {MODES.map((m, i) => (
        <Fragment key={m.id}>
          {i > 0 && (
            <span aria-hidden className="px-1 font-mono text-meta text-muted">
              /
            </span>
          )}
          <button
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => setGraphMode(m.id)}
            className={`tap px-2 font-pixel uppercase ${mode === m.id ? m.active : 'inv-hover'}`}
          >
            {m.label}
          </button>
        </Fragment>
      ))}
    </div>
  )
}

const SKINS: { id: CrtSkin; label: string }[] = [
  { id: 'hammertone', label: 'Hammertone' },
  { id: 'blackpanel', label: 'Black panel' }
]

function SkinSwitch(): React.JSX.Element {
  const skin = usePanel((s) => s.crtSkin)
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500">Styl CRT</span>
      <div className="flex overflow-hidden rounded border border-neutral-700" role="radiogroup">
        {SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={skin === s.id}
            onClick={() => setCrtSkin(s.id)}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              skin === s.id
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
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
    if (NODE_DEFS[type].category === 'filter') {
      // Filtr wpina się za zaznaczonym node'em albo przed wyjściem.
      const { graph, id } = insertFilter(current(), type, usePanel.getState().selected)
      commitGraph(graph)
      selectNode(id)
      const pos = graph.nodes.find((n) => n.id === id)?.position
      if (pos && rect) {
        const a = flow.flowToScreenPosition(pos)
        const b = flow.flowToScreenPosition({ x: pos.x + NODE_W, y: pos.y + NODE_H })
        // Na szerokim ekranie boki i górę zasłaniają pływające panele (jak w FIT_WIDE).
        const side = WIDE ? 344 : 0
        const top = WIDE ? 140 : 0
        const inView =
          a.x >= rect.left + side &&
          a.y >= rect.top + top &&
          b.x <= rect.right - side &&
          b.y <= rect.bottom
        if (!inView) {
          void flow.setCenter(pos.x + NODE_W / 2, pos.y + NODE_H / 2, { zoom: flow.getZoom() })
        }
      }
      return
    }
    const center = rect
      ? flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 }
    const graph = current()
    const node = createNode(graph, type, { x: center.x - 104, y: center.y - 60 })
    commitGraph(addNode(graph, node))
    selectNode(node.id)
  }
  return (
    <div className="surface flex max-w-full flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 lg:pointer-events-auto">
      <ModeSwitch mode={mode} />
      <SkinSwitch />
      {mode === 'edit' ? (
        GROUPS.map((g) => (
          <div key={g.category} className="flex flex-wrap items-center gap-1">
            <span className="mr-1 font-pixel text-muted uppercase">{g.label} /</span>
            {NODE_TYPES.filter((t) => NODE_DEFS[t].category === g.category).map((t) => (
              <Button
                key={t}
                onClick={() => add(t)}
                title={
                  g.category === 'filter'
                    ? "Wstawia za zaznaczonym node'em albo przed Wyjściem"
                    : undefined
                }
              >
                + {NODE_DEFS[t].label}
              </Button>
            ))}
          </div>
        ))
      ) : (
        <div className="dither-12 border border-danger p-1">
          <p className="bg-black px-2 py-1">
            Kliknij node albo kabel, żeby go usunąć. Usunięcie filtra łączy jego sąsiadów.{' '}
            <span className="tag">Esc</span> powrót do łączenia.
          </p>
        </div>
      )}
    </div>
  )
}

function Inspector(): React.JSX.Element | null {
  const node = usePanel((s) => s.app?.graph.nodes.find((n) => n.id === s.selected))
  if (!node) return null
  const def = NODE_DEFS[node.type]
  return (
    <div className="p-3">
      <NodeCard
        node={node}
        actions={
          def.category === 'filter' && (
            <ToggleTag
              on={!node.bypass}
              title="Włącz / wyłącz efekt"
              onToggle={() => setBypass(node.id, !node.bypass)}
            />
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

function Editor({ left, right }: { left?: ReactNode; right?: ReactNode }): React.JSX.Element {
  const graph = usePanel((s) => s.app!.graph)
  const selected = usePanel((s) => s.selected)
  const hasSelection = usePanel((s) => s.app?.graph.nodes.some((n) => n.id === s.selected) ?? false)
  const mode = usePanel((s) => s.graphMode)
  const deleting = mode === 'delete'
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  // Wymiary zmierzone przez React Flow. Bez `measured` w nodes MiniMapa nic nie rysuje,
  // a React Flow mierzy node'y od nowa przy każdej zmianie grafu.
  const [measured, setMeasured] = useState<Measured>({})
  const container = useRef<HTMLDivElement>(null)
  // Rodzaj i kierunek ciągniętego kabla: klasy kontenera podświetlają pasujące uchwyty.
  const [connecting, setConnecting] = useState<{
    kind: PortKind
    from: 'source' | 'target'
  } | null>(null)
  // Node'y, z którymi połączy się ciągnięty kabel obrazu upuszczony na ich korpus.
  const [linkable, setLinkable] = useState<ReadonlySet<string> | null>(null)
  // Filtr przeciągany nad kablem obrazu: `edge` to id kabla (jego wejście).
  const [drop, setDrop] = useState<{ edge: string; node: string } | null>(null)
  // Ostatni kabel pod kursorem, czy da się w niego wpiąć (liczone raz na kabel)
  // i który kabel jest podświetlony (setState tylko przy zmianie).
  const dragHit = useRef<{ edge: string | null; ok: boolean; shown: string | null }>({
    edge: null,
    ok: false,
    shown: null
  })

  // Pakiety na kablach: jedna pętla rAF na czas życia edytora.
  useEffect(() => startFlow(), [])

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
        deletable: n.type !== 'Output',
        measured: measured[n.id],
        className:
          drop?.node === n.id
            ? 'vz-node-drop'
            : linkable?.has(n.id)
              ? 'vz-node-linkable'
              : undefined
      })),
    [graph, selected, deleting, measured, drop, linkable]
  )

  const edges = useMemo<VzEdge[]>(
    () =>
      graph.edges.map((e) => {
        const f = splitPort(e.from)
        const t = splitPort(e.to)
        const signal = edgeKind(graph, e) === 'signal'
        const active = !deleting && e.to === selectedEdge
        const color = signal ? lineVar(signalColor(graph, e.from)) : 'var(--color-term-white)'
        const dim = isDimmed(graph, e, signal)
        return {
          id: e.to,
          type: 'vz',
          data: {
            source: flowSource(graph, e, signal),
            dim,
            color: signal ? color : 'var(--color-term-bright-white)'
          },
          source: f.node,
          sourceHandle: f.port,
          target: t.node,
          targetHandle: t.port,
          // Bez animacji przerywanej linii: ruch tylko transform/opacity.
          animated: false,
          selected: active,
          className: deleting ? 'vz-edge-delete' : drop?.edge === e.to ? 'vz-edge-drop' : undefined,
          interactionWidth: deleting ? 24 : 20,
          label:
            signal && (e.scale !== undefined || e.offset !== undefined)
              ? `×${e.scale ?? 1} +${e.offset ?? 0}`
              : undefined,
          labelStyle: {
            fill: 'var(--color-term-white)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)'
          },
          labelBgStyle: { fill: 'var(--xy-edge-label-background-color)' },
          labelBgPadding: [4, 4] as [number, number],
          labelBgBorderRadius: 0,
          style: {
            stroke: color,
            strokeWidth: active ? 3 : 2,
            strokeDasharray: signal ? '2 3' : undefined,
            // Przygaszenie nie może tłumić podświetleń (zaznaczenie, usuwanie, wpięcie).
            opacity: dim && !active && !deleting && drop?.edge !== e.to ? 0.4 : undefined
          }
        }
      }),
    [graph, selectedEdge, deleting, drop]
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
    let dims: Measured | null = null
    for (const c of changes) {
      if (c.type === 'dimensions' && c.dimensions) {
        dims ??= {}
        dims[c.id] = c.dimensions
      } else if (c.type === 'position' && c.position) {
        g = updateNode(g, c.id, { position: c.position })
      } else if (c.type === 'select') {
        if (c.selected) selectNode(c.id)
        else if (usePanel.getState().selected === c.id) selectNode(null)
      }
    }
    if (g !== current()) setGraphLocal(g)
    if (dims) {
      const next = dims
      setMeasured((prev) => mergeMeasured(prev, next, current()))
    }
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    for (const c of changes) {
      if (c.type === 'select') setSelectedEdge(c.selected ? c.id : null)
    }
  }, [])

  const onConnect = useCallback((c: Connection) => {
    const { from, to } = toRefs(c)
    link(from, to)
  }, [])

  const onConnectStart = useCallback<OnConnectStart>((_e, { nodeId, handleId, handleType }) => {
    const g = current()
    const node = g.nodes.find((n) => n.id === nodeId)
    if (!node || handleId === null || handleType === null) return
    const kind = handleType === 'source' ? outputKind(node, handleId) : inputKind(node, handleId)
    if (!kind) return
    setConnecting({ kind, from: handleType })
    if (kind !== 'video') return
    // Raz na początku ciągnięcia: które korpusy przyjmą kabel (bez sygnałów, startu i cykli).
    const ref = portRef(node.id, handleId)
    const ids = new Set<string>()
    for (const n of g.nodes) {
      if (videoLinkToNode(g, ref, handleType, n.id)) ids.add(n.id)
    }
    setLinkable(ids)
  }, [])

  // Kabel upuszczony poza uchwytem: na korpusie node'a kabel obrazu wpina się w jego port obrazu.
  const onConnectEnd = useCallback<OnConnectEnd>((event, state) => {
    setConnecting(null)
    setLinkable(null)
    if (state.isValid || !state.fromHandle) return
    const p = eventPoint(event)
    if (!p) return
    const nodeId = document
      .elementFromPoint(p.x, p.y)
      ?.closest('.react-flow__node')
      ?.getAttribute('data-id')
    if (!nodeId) return
    const { nodeId: fromNode, id, type } = state.fromHandle
    const l = videoLinkToNode(current(), portRef(fromNode, id ?? ''), type, nodeId)
    if (l) link(l.from, l.to)
  }, [])

  // Filtr nad kablem obrazu: podświetlenie kabla, w który wepnie się po puszczeniu.
  const onNodeDrag = useCallback<OnNodeDrag<VzNode>>((event, node) => {
    const def = NODE_DEFS[node.data.node.type]
    if (!def.videoIn || !def.videoOut) return
    const g = current()
    const p = eventPoint(event)
    const edge = p ? edgeAt(p.x, p.y, node.id, g) : null
    const hit = dragHit.current
    if (edge !== hit.edge) {
      hit.edge = edge
      hit.ok = edge !== null && spliceIntoEdge(g, node.id, edge) !== g
    }
    const next = hit.ok ? hit.edge : null
    if (next !== hit.shown) {
      hit.shown = next
      setDrop(next ? { edge: next, node: node.id } : null)
    }
  }, [])

  const onNodeDragStop = useCallback<OnNodeDrag<VzNode>>((_e, node) => {
    const hit = dragHit.current
    const edge = hit.shown
    hit.edge = null
    hit.ok = false
    hit.shown = null
    if (edge) setDrop(null)
    const g = current()
    commitGraph(edge ? spliceIntoEdge(g, node.id, edge) : g)
  }, [])

  const isValidConnection = useCallback((c: Connection | Edge) => {
    const g = current()
    const { from, to } = toRefs(c)
    // Zajęte wejście też jest OK: nowy kabel zastąpi stary.
    return canConnect(disconnect(g, to), from, to)
  }, [])

  return (
    <div className="flex flex-col gap-3 lg:relative lg:h-full">
      {/* Płótno: na szerokim ekranie cała powierzchnia, na wąskim ~70svh. */}
      <div
        ref={container}
        className={`relative order-2 h-[70svh] border border-line-dim lg:absolute lg:inset-0 lg:order-none lg:h-auto lg:border-0 ${deleting ? 'vz-delete-frame' : ''} ${connecting ? `vz-connecting-${connecting.kind} vz-connecting-from-${connecting.from}` : ''}`}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          connectionRadius={36}
          isValidConnection={isValidConnection}
          nodesConnectable={!deleting}
          nodesDraggable={!deleting}
          elementsSelectable={!deleting}
          onNodeClick={(_e, node) => deleting && deleteFromGraph([node.id])}
          onEdgeClick={(_e, edge) => deleting && deleteFromGraph([], [edge.id])}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => selectNode(null)}
          onBeforeDelete={onBeforeDelete}
          deleteKeyCode={['Backspace', 'Delete']}
          colorMode="dark"
          fitView
          fitViewOptions={WIDE ? FIT_WIDE : FIT_NARROW}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          {/* Przycisk „dopasuj” pokazuje cały graf między panelami (bez minZoom ze startu). */}
          <Controls
            position="bottom-left"
            fitViewOptions={WIDE ? { padding: FIT_WIDE.padding } : FIT_NARROW}
          />
          {WIDE && <MiniMap position="bottom-center" pannable zoomable />}
        </ReactFlow>
      </div>

      {/* Panele: na szerokim ekranie pływają nad płótnem (warstwa przepuszcza kursor, panele nie),
          na wąskim `contents` wpina je w zwykłą kolumnę (kolejność przez `order`). */}
      <div className="contents lg:pointer-events-none lg:absolute lg:inset-0 lg:z-10 lg:flex lg:items-start lg:gap-3 lg:p-3">
        <div className="order-3 flex min-h-0 flex-col gap-3 lg:pointer-events-auto lg:order-none lg:max-h-[calc(100%-136px)] lg:w-80 lg:flex-none">
          {left}
          {hasSelection && (
            <aside className="surface min-h-0 overflow-y-auto" aria-label="Inspektor node'a">
              <Inspector />
            </aside>
          )}
        </div>
        <div className="order-1 min-w-0 lg:order-none lg:flex lg:flex-1 lg:justify-center">
          <Toolbar container={container} mode={mode} />
        </div>
        <div className="order-4 flex flex-col gap-3 lg:pointer-events-auto lg:order-none lg:max-h-full lg:w-80 lg:flex-none lg:overflow-y-auto">
          {right}
        </div>
      </div>
    </div>
  )
}

/**
 * Graf z pływającymi panelami. `left` i `right` to kolumny nad płótnem (szeroki ekran)
 * albo pod nim (wąski). Inspektor dochodzi do lewej kolumny przy zaznaczonym node'ie.
 */
export function NodeEditor({
  left,
  right
}: {
  left?: ReactNode
  right?: ReactNode
}): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <Editor left={left} right={right} />
    </ReactFlowProvider>
  )
}
