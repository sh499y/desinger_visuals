import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { defaultGraph, sanitizeGraph } from '@shared/graph'
import type { ServerInfo, ServerMessage, VideoItem } from '@shared/types'
import { AppStore } from './store'

const server: ServerInfo = {
  port: 4000,
  localUrl: 'http://127.0.0.1:4000',
  panelUrl: 'http://127.0.0.1:4000/',
  lan: false,
  lanUrls: []
}

const video = (id: string): VideoItem => ({
  id,
  name: `${id}.mp4`,
  size: 1,
  duration: null,
  thumb: null
})

let dir: string
let path: string
let store: AppStore
let messages: ServerMessage[]

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vz-store-'))
  path = join(dir, 'state.json')
  store = new AppStore(path, server)
  messages = []
  store.subscribe((m) => messages.push(m))
})

afterEach(async () => {
  vi.useRealTimers()
  await rm(dir, { recursive: true, force: true })
})

describe('AppStore', () => {
  it('startuje z domyślnym grafem i pustą biblioteką', () => {
    const s = store.get()
    expect(s.graph).toEqual(defaultGraph())
    expect(s.library).toEqual([])
    expect(s.activeId).toBeNull()
    expect(s.audio.loopback.state).toBe('unavailable')
  })

  it('setLibrary wybiera pierwsze wideo, gdy aktywne zniknęło', () => {
    store.setLibrary([video('a'), video('b')])
    expect(store.get().activeId).toBe('a')
    store.select('b')
    store.setLibrary([video('a')])
    expect(store.get().activeId).toBe('a')
    store.setLibrary([])
    expect(store.get().activeId).toBeNull()
    expect(messages.every((m) => m.type === 'state')).toBe(true)
  })

  it('select ignoruje id spoza biblioteki', () => {
    store.setLibrary([video('a')])
    store.select('ghost')
    expect(store.get().activeId).toBe('a')
    store.select(null)
    expect(store.get().activeId).toBeNull()
  })

  it('setParam przycina wartość i wysyła lekką łatkę', () => {
    store.setParam('bloom1', 'intensity', 99)
    expect(messages).toEqual([{ type: 'param', node: 'bloom1', param: 'intensity', value: 10 }])
    const bloom = store.get().graph.nodes.find((n) => n.id === 'bloom1')!
    expect(bloom.params.intensity).toBe(10)
  })

  it('setParam ignoruje nieznany node, parametr i zły typ', () => {
    store.setParam('ghost', 'intensity', 1)
    store.setParam('bloom1', 'ghost', 1)
    store.setParam('bloom1', 'intensity', 'dużo')
    expect(messages).toEqual([])
  })

  it('setParam nie mutuje poprzedniego stanu', () => {
    const before = store.get()
    store.setParam('bloom1', 'intensity', 3)
    expect(before.graph.nodes.find((n) => n.id === 'bloom1')!.params.intensity).toBe(1.5)
  })

  it('setBypass włącza i usuwa flagę', () => {
    store.setBypass('bloom1', true)
    expect(store.get().graph.nodes.find((n) => n.id === 'bloom1')!.bypass).toBe(true)
    store.setBypass('bloom1', false)
    expect(store.get().graph.nodes.find((n) => n.id === 'bloom1')!.bypass).toBeUndefined()
  })

  it('setGraph sanityzuje dane z sieci', () => {
    store.setGraph({ nodes: [{ id: 'x', type: 'Bloom', params: { intensity: -5 } }], edges: [] })
    const g = store.get().graph
    expect(g.nodes.map((n) => n.id)).toEqual(['x', 'out'])
    expect(g.nodes[0].params.intensity).toBe(0)
  })

  it('stan audio i wyjścia', () => {
    store.setAudioDevice('mic')
    store.setAudioStatus({ devices: [], activeId: 'mic', activeLabel: 'Mic', error: null })
    store.setLoopback({ state: 'on', error: null })
    store.setOutput({ fullscreen: true })
    const s = store.get()
    expect(s.audio).toMatchObject({
      deviceId: 'mic',
      activeLabel: 'Mic',
      loopback: { state: 'on' }
    })
    expect(s.output.fullscreen).toBe(true)
  })

  it('audio rozsyła poziomy bez zmiany stanu', () => {
    const before = store.get()
    store.audio({ bass: 1, mid: 0, high: 0, level: 0, beat: 0 })
    expect(messages).toEqual([{ type: 'audio', bass: 1, mid: 0, high: 0, level: 0, beat: 0 }])
    expect(store.get()).toBe(before)
  })

  it('subscribe zwraca funkcję odpinającą', () => {
    const fn = vi.fn()
    const off = store.subscribe(fn)
    off()
    store.setServer(server)
    expect(fn).not.toHaveBeenCalled()
  })

  it('zapisuje graf, aktywne wideo i wejście audio na dysk', async () => {
    store.setLibrary([video('a')])
    store.setParam('bloom1', 'intensity', 4)
    store.setAudioDevice('mic')
    await store.persist()
    const saved = JSON.parse(await readFile(path, 'utf8'))
    expect(saved).toMatchObject({ activeId: 'a', audioDeviceId: 'mic' })

    const reopened = new AppStore(path, server)
    expect(reopened.get().activeId).toBe('a')
    expect(reopened.get().audio.deviceId).toBe('mic')
    expect(reopened.get().graph.nodes.find((n) => n.id === 'bloom1')!.params.intensity).toBe(4)
  })

  it('zapis jest odkładany (debounce)', async () => {
    vi.useFakeTimers()
    store.setParam('bloom1', 'intensity', 2)
    store.setParam('bloom1', 'intensity', 3)
    await expect(readFile(path, 'utf8')).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(600)
    vi.useRealTimers()
    await vi.waitFor(async () => {
      const saved = JSON.parse(await readFile(path, 'utf8'))
      expect(
        saved.graph.nodes.find((n: { id: string }) => n.id === 'bloom1').params.intensity
      ).toBe(3)
    })
  })

  it('uszkodzony plik stanu → wartości domyślne', async () => {
    await writeFile(path, '{zepsute')
    expect(new AppStore(path, server).get().graph).toEqual(defaultGraph())
  })
})

describe('AppStore – kolejka klipów', () => {
  const withNode = (id: string): ReturnType<typeof defaultGraph> => {
    const g = defaultGraph()
    return sanitizeGraph({
      ...g,
      nodes: [...g.nodes, { id, type: 'Vignette', params: {}, position: { x: 0, y: 0 } }]
    })
  }

  beforeEach(() => store.setLibrary([video('a'), video('b'), video('c')]))

  it('timelineAdd: tylko klipy z biblioteki, element dostaje kopię bieżącego grafu', () => {
    store.timelineAdd('nope')
    expect(store.get().timeline.items).toEqual([])
    store.setGraph(withNode('vig1'))
    store.timelineAdd('b')
    const [item] = store.get().timeline.items
    expect(item.videoId).toBe('b')
    expect(item.graph).toEqual(store.get().graph)
  })

  it('play ustawia klip i graf bieżącego elementu, next przechodzi dalej i pomija usunięte klipy', () => {
    store.setGraph(withNode('first'))
    store.timelineAdd('a')
    store.setGraph(withNode('second'))
    store.timelineAdd('b')
    store.setGraph(withNode('third'))
    store.timelineAdd('c')
    store.select('c')

    store.timelinePlay(true)
    expect(store.get().activeId).toBe('a')
    expect(store.get().graph.nodes.some((n) => n.id === 'first')).toBe(true)

    store.timelineNext()
    expect(store.get().timeline.index).toBe(1)
    expect(store.get().activeId).toBe('b')
    expect(store.get().graph.nodes.some((n) => n.id === 'second')).toBe(true)

    store.setLibrary([video('a'), video('b')])
    store.timelineNext()
    expect(store.get().timeline.index).toBe(0)
    expect(store.get().activeId).toBe('a')
  })

  it('next bez istniejących klipów zatrzymuje kolejkę; next przy stojącej kolejce nic nie robi', () => {
    store.timelineAdd('a')
    store.timelineNext()
    expect(store.get().timeline.index).toBe(0)
    store.timelinePlay(true)
    store.setLibrary([video('z')])
    store.timelineNext()
    expect(store.get().timeline.playing).toBe(false)
  })

  it('goto przechodzi do elementu i stosuje go', () => {
    store.timelineAdd('a')
    store.timelineAdd('b')
    store.timelinePlay(true)
    store.timelineGoto(1)
    expect(store.get().timeline.index).toBe(1)
    expect(store.get().activeId).toBe('b')
    store.timelineGoto(9)
    expect(store.get().timeline.index).toBe(1)
  })

  it('zmiany grafu zapisują się do pokazanego ujęcia także po zatrzymaniu kolejki', () => {
    store.setGraph(withNode('vig1'))
    store.timelineAdd('a')
    store.timelineAdd('b')
    store.timelinePlay(true)
    store.setParam('vig1', 'darkness', 0.9)
    expect(
      store.get().timeline.items[0].graph.nodes.find((n) => n.id === 'vig1')!.params.darkness
    ).toBe(0.9)
    store.setBypass('vig1', true)
    expect(store.get().timeline.items[0].graph.nodes.find((n) => n.id === 'vig1')!.bypass).toBe(
      true
    )

    store.timelinePlay(false)
    store.timelineGoto(1)
    expect(store.get().timeline.linked).toBe(true)
    store.setParam('vig1', 'darkness', 0.2)
    const [first, second] = store.get().timeline.items
    expect(second.graph.nodes.find((n) => n.id === 'vig1')!.params.darkness).toBe(0.2)
    expect(first.graph.nodes.find((n) => n.id === 'vig1')!.params.darkness).toBe(0.9)
  })

  it('wybór klipu w bibliotece rozłącza graf od ujęć', () => {
    store.setGraph(withNode('vig1'))
    store.timelineAdd('a')
    store.timelineGoto(0)
    store.select('c')
    expect(store.get().timeline.linked).toBe(false)
    store.setParam('vig1', 'darkness', 0.1)
    expect(
      store.get().timeline.items[0].graph.nodes.find((n) => n.id === 'vig1')!.params.darkness
    ).not.toBe(0.1)
  })

  it('usunięcie grającego elementu przełącza na następny razem z jego grafem i klipem', () => {
    store.setGraph(withNode('first'))
    store.timelineAdd('a')
    store.setGraph(withNode('second'))
    store.timelineAdd('b')
    store.timelinePlay(true)
    const [first, second] = store.get().timeline.items
    store.timelineRemove(first.id)
    expect(store.get().activeId).toBe('b')
    expect(store.get().graph.nodes.some((n) => n.id === 'second')).toBe(true)
    // efekty klipu b nie zostały nadpisane grafem usuniętego elementu
    expect(store.get().timeline.items[0]).toEqual(second)
  })

  it('remove/move/update przechodzą przez operacje kolejki', () => {
    store.timelineAdd('a')
    store.timelineAdd('b')
    const [first, second] = store.get().timeline.items
    store.timelineMove(second.id, 0)
    expect(store.get().timeline.items.map((i) => i.id)).toEqual([second.id, first.id])
    store.timelineUpdate(first.id, { duration: 4, inPoint: 1, outPoint: 3 })
    expect(store.get().timeline.items[1]).toMatchObject({ duration: 4, inPoint: 1, outPoint: 3 })
    store.timelineRemove(second.id)
    expect(store.get().timeline.items.map((i) => i.id)).toEqual([first.id])
  })

  it('kolejka przeżywa zapis i ponowne wczytanie', async () => {
    store.timelineAdd('a')
    store.timelineUpdate(store.get().timeline.items[0].id, { duration: 7 })
    await store.persist()
    const again = new AppStore(path, server)
    expect(again.get().timeline.items).toEqual(store.get().timeline.items)
  })
})
