// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoPool, type VideoSlot } from './VideoSource'

let videos: HTMLVideoElement[]

beforeEach(() => {
  videos = []
  // happy-dom nie odtwarza mediów – play/load tylko udajemy.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  const create = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = create(tag)
    if (tag === 'video') videos.push(el as HTMLVideoElement)
    return el
  }) as typeof document.createElement)
})

afterEach(() => vi.restoreAllMocks())

const playing = (v: HTMLVideoElement): boolean => v.dispatchEvent(new Event('playing'))

describe('VideoPool', () => {
  it('tworzy dwa wyciszone elementy gotowe do tekstur WebGL', () => {
    new VideoPool(() => {})
    expect(videos).toHaveLength(2)
    for (const v of videos) {
      expect(v.muted).toBe(true)
      expect(v.crossOrigin).toBe('anonymous')
      expect(v.loop).toBe(true)
    }
  })

  it('podmienia wideo dopiero, gdy nowe zacznie grać', () => {
    const onSwap = vi.fn<(s: VideoSlot | null) => void>()
    const pool = new VideoPool(onSwap)
    pool.request('http://x/media/a')
    const [a] = videos
    expect(a.getAttribute('src')).toBe('http://x/media/a')
    expect(onSwap).not.toHaveBeenCalled()
    expect(pool.active).toBeNull()

    playing(a)
    expect(onSwap).toHaveBeenLastCalledWith(pool.active)
    expect(pool.active?.video).toBe(a)
  })

  it('stare wideo gra do czasu podmiany, potem jest zwalniane', () => {
    const onSwap = vi.fn()
    const pool = new VideoPool(onSwap)
    const [a, b] = videos
    pool.request('A')
    playing(a)
    pool.request('B')
    expect(b.getAttribute('src')).toBe('B')
    expect(pool.active?.video).toBe(a)
    expect(a.getAttribute('src')).toBe('A')

    playing(b)
    expect(pool.active?.video).toBe(b)
    expect(a.hasAttribute('src')).toBe(false)
  })

  it('przy szybkim przełączaniu wygrywa ostatni plik', () => {
    const onSwap = vi.fn()
    const pool = new VideoPool(onSwap)
    const [a] = videos
    pool.request('A')
    pool.request('B') // ten sam slot, nowy src zanim A zaczęło grać
    playing(a)
    expect(onSwap).toHaveBeenCalledTimes(1)
    expect(a.getAttribute('src')).toBe('B')
    expect(pool.active?.video).toBe(a)
  })

  it('ten sam adres drugi raz nic nie robi', () => {
    const pool = new VideoPool(() => {})
    pool.request('A')
    pool.request('A')
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  })

  it('null zatrzymuje wszystko', () => {
    const onSwap = vi.fn()
    const pool = new VideoPool(onSwap)
    pool.request('A')
    playing(videos[0])
    pool.request(null)
    expect(onSwap).toHaveBeenLastCalledWith(null)
    expect(pool.active).toBeNull()
    expect(videos.every((v) => !v.hasAttribute('src'))).toBe(true)
  })

  it('pętla i prędkość trafiają do aktywnego wideo, małe zmiany prędkości są pomijane', () => {
    const pool = new VideoPool(() => {})
    pool.request('A')
    const [a] = videos
    playing(a)
    pool.setLoop(false)
    expect(a.loop).toBe(false)
    pool.setSpeed(2)
    expect(a.playbackRate).toBe(2)
    pool.setSpeed(2.005)
    expect(a.playbackRate).toBe(2)
  })

  it('nowy plik dziedziczy ustawienia pętli i prędkości', () => {
    const pool = new VideoPool(() => {})
    pool.setLoop(false)
    pool.setSpeed(0.5)
    pool.request('A')
    expect(videos[0].loop).toBe(false)
    expect(videos[0].playbackRate).toBe(0.5)
  })
})
