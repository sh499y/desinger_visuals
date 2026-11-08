import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultGraph, getChain } from '@shared/graph'
import type { AppState, ClientMessage, ServerMessage } from '@shared/types'

// Udawane połączenie z serwerem: przechwytujemy wysyłane wiadomości i handlery.
const conn = vi.hoisted(() => ({
  sent: [] as ClientMessage[],
  onMessage: null as ((m: ServerMessage) => void) | null,
  onStatus: null as ((c: boolean) => void) | null
}))

vi.mock('./api', () => ({
  connection: {
    send: (m: ClientMessage) => conn.sent.push(m),
    onMessage: (h: (m: ServerMessage) => void) => (conn.onMessage = h),
    onStatus: (h: (c: boolean) => void) => (conn.onStatus = h)
  }
}))

import {
  commitGraph,
  createLoopback,
  defaultBinding,
  deleteFromGraph,
  selectNode,
  selectVideo,
  setAudioDevice,
  setBypass,
  setFullscreen,
  setGraphLocal,
  setGraphMode,
  setLan,
  setParamValue,
  usePanel
} from './store'

const initial = usePanel.getState()

function appState(patch: Partial<AppState> = {}): AppState {
  return {
    library: [{ id: 'v1', name: 'a.mp4', size: 1, duration: null, thumb: null }],
    activeId: 'v1',
    graph: defaultGraph(),
    audio: {
      deviceId: null,
      devices: [],
      activeId: null,
      activeLabel: null,
      error: null,
      loopback: { state: 'on', error: null }
    },
    output: { fullscreen: false, displays: [] },
    server: { port: 4000, localUrl: '', panelUrl: '', lan: false, lanUrls: [] },
    ...patch
  }
}

const receive = (msg: ServerMessage): void => conn.onMessage!(msg)
const graph = (): AppState['graph'] => usePanel.getState().app!.graph
const param = (id: string, key: string): unknown =>
  graph().nodes.find((n) => n.id === id)!.params[key]

beforeEach(() => {
  usePanel.setState(initial, true)
  receive({ type: 'state', ...appState() })
  conn.sent.length = 0
})

describe('wiadomości z serwera', () => {
  it('state ustawia stan i czyści zaznaczenie nieistniejącego node’a', () => {
    selectNode('bloom1')
    receive({ type: 'state', ...appState() })
    expect(usePanel.getState().selected).toBe('bloom1')
    receive({ type: 'state', ...appState({ graph: { version: 1, nodes: [], edges: [] } }) })
    expect(usePanel.getState().selected).toBeNull()
  })

  it('param łata jeden parametr', () => {
    receive({ type: 'param', node: 'bloom1', param: 'intensity', value: 7 })
    expect(param('bloom1', 'intensity')).toBe(7)
  })

  it('audio i status połączenia', () => {
    receive({ type: 'audio', bass: 0.5, mid: 0, high: 0, level: 0, beat: 1 })
    expect(usePanel.getState().audio).toEqual({ bass: 0.5, mid: 0, high: 0, level: 0, beat: 1 })
    conn.onStatus!(true)
    expect(usePanel.getState().connected).toBe(true)
  })

  it('error tylko loguje', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    receive({ type: 'error', message: 'zła wiadomość' })
    expect(warn).toHaveBeenCalled()
  })
})

describe('akcje panelu', () => {
  it('setParamValue zmienia lokalnie od razu i wysyła effects:set', () => {
    setParamValue('bloom1', 'intensity', 4)
    expect(param('bloom1', 'intensity')).toBe(4)
    expect(conn.sent).toEqual([
      { type: 'effects:set', node: 'bloom1', param: 'intensity', value: 4 }
    ])
  })

  it('selectVideo działa optymistycznie', () => {
    selectVideo(null)
    expect(usePanel.getState().app!.activeId).toBeNull()
    expect(conn.sent).toEqual([{ type: 'playback:select', id: null }])
  })

  it('commitGraph wysyła graf, setGraphLocal nie', () => {
    const g = { ...defaultGraph(), nodes: defaultGraph().nodes.slice(0, 2) }
    setGraphLocal(g)
    expect(graph()).toBe(g)
    expect(conn.sent).toEqual([])
    commitGraph(g)
    expect(conn.sent).toEqual([{ type: 'graph:set', graph: g }])
  })

  it('proste komendy wysyłają właściwe wiadomości', () => {
    setBypass('bloom1', true)
    setAudioDevice('mic')
    setFullscreen(true, 3)
    setLan(true)
    createLoopback()
    expect(conn.sent).toEqual([
      { type: 'node:bypass', node: 'bloom1', bypass: true },
      { type: 'audio:device', deviceId: 'mic' },
      { type: 'output:fullscreen', on: true, displayId: 3 },
      { type: 'settings:lan', enabled: true },
      { type: 'audio:loopback' }
    ])
  })

  it('akcje bez stanu z serwera nie wywracają się', () => {
    usePanel.setState({ app: null })
    setParamValue('bloom1', 'intensity', 1)
    deleteFromGraph(['bloom1'])
    expect(usePanel.getState().app).toBeNull()
  })
})

describe('usuwanie i tryb grafu', () => {
  it('deleteFromGraph usuwa filtr, naprawia łańcuch i wysyła graf', () => {
    deleteFromGraph(['bloom1'])
    expect(getChain(graph()).filters.map((n) => n.id)).toEqual([
      'huesaturation1',
      'rgbsplit1',
      'vignette1'
    ])
    expect(conn.sent.map((m) => m.type)).toEqual(['graph:set'])
  })

  it('czyści zaznaczenie usuniętego node’a', () => {
    selectNode('bloom1')
    deleteFromGraph(['bloom1'])
    expect(usePanel.getState().selected).toBeNull()
  })

  it('nic nie wysyła, gdy nic się nie zmieniło (np. próba usunięcia wyjścia)', () => {
    deleteFromGraph(['out'])
    expect(conn.sent).toEqual([])
  })

  it('tryb usuwania czyści zaznaczenie, powrót go nie zmienia', () => {
    selectNode('bloom1')
    setGraphMode('delete')
    expect(usePanel.getState()).toMatchObject({ graphMode: 'delete', selected: null })
    selectNode('bloom1')
    setGraphMode('edit')
    expect(usePanel.getState()).toMatchObject({ graphMode: 'edit', selected: 'bloom1' })
  })
})

describe('defaultBinding', () => {
  it('skala = pół zakresu, offset = bieżąca wartość', () => {
    // Vignette.darkness: zakres 0..1, wartość 0,6
    expect(defaultBinding(graph(), 'vignette1.darkness')).toEqual({ scale: 0.5, offset: 0.6 })
    // HueSaturation.hue: zakres -180..180
    expect(defaultBinding(graph(), 'huesaturation1.hue')).toEqual({ scale: 180, offset: 0 })
  })

  it('wejście, które nie jest parametrem liczbowym', () => {
    expect(defaultBinding(graph(), 'ghost.x')).toEqual({ scale: 1, offset: 0 })
  })
})
