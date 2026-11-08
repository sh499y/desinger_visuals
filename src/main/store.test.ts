import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { defaultGraph } from '@shared/graph'
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
