// Pula dwóch elementów <video>: nowy plik ładuje się w tle, a podmiana
// następuje dopiero, gdy zacznie grać – bez czarnej klatki przy przełączaniu.

import { LinearFilter, SRGBColorSpace, VideoTexture } from 'three'

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
  private loop = true
  private speed = 1

  constructor(private readonly onSwap: (slot: VideoSlot | null) => void) {
    for (const s of this.slots) {
      s.video.addEventListener('error', () => {
        if (s.video.getAttribute('src'))
          console.warn('Błąd wideo', s.video.error?.message, s.video.src)
      })
    }
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
      this.onSwap(null)
      return
    }
    const nextIndex = this.activeIndex === 0 ? 1 : 0
    const next = this.slots[nextIndex]
    next.video.loop = this.loop
    next.video.src = url
    next.video.playbackRate = this.speed
    next.video.addEventListener(
      'playing',
      () => {
        if (this.url !== url) return
        const prev = this.active
        this.activeIndex = nextIndex
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

  dispose(): void {
    for (const s of this.slots) {
      unload(s.video)
      s.texture.dispose()
    }
  }
}
