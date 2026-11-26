// Pula dwóch elementów <video>: nowy plik ładuje się w tle, a podmiana
// następuje dopiero, gdy zacznie grać – bez czarnej klatki przy przełączaniu.

import { LinearFilter, SRGBColorSpace, VideoTexture } from 'three'
import { loopTarget } from '../timeline'

export interface VideoSlot {
  video: HTMLVideoElement
  texture: VideoTexture
}

function createSlot(): VideoSlot {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.loop = true
  video.preload = 'auto'
  // Wideo z serwera (inny origin) – bez CORS tekstura WebGL byłaby zablokowana.
  video.crossOrigin = 'anonymous'
  const texture = new VideoTexture(video)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  return { video, texture }
}

function unload(video: HTMLVideoElement): void {
  video.pause()
  video.removeAttribute('src')
  video.load()
}

export class VideoPool {
  private readonly slots: [VideoSlot, VideoSlot] = [createSlot(), createSlot()]
  private activeIndex: number | null = null
  private url: string | null = null
  /** Plik, który faktycznie gra (po podmianie). */
  private activeUrl: string | null = null
  private loop = true
  /** Fragment od–do (kolejka klipów); null = cały plik jak dotąd. */
  private range: { inPoint: number; outPoint: number | null } | null = null
  private speed = 1

  constructor(private readonly onSwap: (slot: VideoSlot | null) => void) {
    for (const s of this.slots) {
      // Nowy plik w trybie fragmentu startuje od jego początku.
      s.video.addEventListener('loadedmetadata', () => {
        if (this.range) s.video.currentTime = this.startOf(s.video)
      })
      s.video.addEventListener('error', () => {
        if (s.video.getAttribute('src'))
          console.warn('Błąd wideo', s.video.error?.message, s.video.src)
      })
    }
  }

  /** Grające wideo to ostatnio zlecony plik (podmiana już nastąpiła). */
  get ready(): boolean {
    return this.url !== null && this.activeUrl === this.url
  }

  get active(): VideoSlot | null {
    return this.activeIndex === null ? null : this.slots[this.activeIndex]
  }

  request(url: string | null): void {
    if (url === this.url) return
    this.url = url
    if (url === null) {
      this.slots.forEach((s) => unload(s.video))
      this.activeIndex = null
      this.activeUrl = null
      this.onSwap(null)
      return
    }
    const nextIndex = this.activeIndex === 0 ? 1 : 0
    const next = this.slots[nextIndex]
    next.video.loop = this.range ? false : this.loop
    next.video.src = url
    next.video.playbackRate = this.speed
    next.video.addEventListener(
      'playing',
      () => {
        if (this.url !== url) return
        const prev = this.active
        this.activeIndex = nextIndex
        this.activeUrl = url
        if (prev && prev !== next) unload(prev.video)
        this.onSwap(next)
      },
      { once: true }
    )
    next.video.play().catch(() => {
      // Przerwane przez kolejną zmianę pliku – nic do zrobienia.
    })
  }

  setLoop(loop: boolean): void {
    if (loop === this.loop) return
    this.loop = loop
    if (this.range) return // w trybie fragmentu pętlę robi enforceRange
    const v = this.active?.video
    if (v) {
      v.loop = loop
      if (loop && v.ended) void v.play()
    }
  }

  setSpeed(speed: number): void {
    if (Math.abs(speed - this.speed) < 0.01) return
    this.speed = speed
    const v = this.active?.video
    if (v) v.playbackRate = speed
  }

  /**
   * Gra tylko fragment od–do. `restart` przewija grające wideo na początek
   * fragmentu – tylko gdy nie czeka już podmiana na inny plik.
   */
  setRange(inPoint: number, outPoint: number | null, restart: boolean): void {
    this.range = { inPoint, outPoint }
    for (const s of this.slots) s.video.loop = false
    const v = this.active?.video
    if (v && restart && this.activeUrl === this.url) v.currentTime = this.startOf(v)
  }

  clearRange(): void {
    if (!this.range) return
    this.range = null
    for (const s of this.slots) s.video.loop = this.loop
  }

  /** Co klatkę: pilnuje pętli fragmentu. Bez fragmentu nic nie robi. */
  enforceRange(): void {
    const r = this.range
    const v = this.active?.video
    if (!r || !v) return
    const t = loopTarget(v.currentTime, v.duration, r.inPoint, r.outPoint)
    if (t === null) return
    v.currentTime = t
    if (v.paused || v.ended) v.play().catch(() => {})
  }

  private startOf(v: HTMLVideoElement): number {
    const r = this.range
    if (!r) return 0
    return loopTarget(-1, v.duration, r.inPoint, r.outPoint) ?? r.inPoint
  }

  dispose(): void {
    for (const s of this.slots) {
      unload(s.video)
      s.texture.dispose()
    }
  }
}
