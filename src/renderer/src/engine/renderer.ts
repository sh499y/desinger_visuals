// Three.js + EffectComposer + pętla rAF. React nie bierze udziału w klatce:
// stan przychodzi przez setState/patchParam, a pętla tylko go czyta.

import { EffectComposer, EffectPass, RenderPass } from 'postprocessing'
import {
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer
} from 'three'
import {
  AUDIO_SEND_INTERVAL_MS,
  type AppState,
  type AudioStatus,
  type GraphNode,
  type ParamValue
} from '@shared/types'
import { AudioInput } from './audio/capture'
import { compileGraph, SignalBus, type CompiledGraph } from './graph'
import { createEffect, type EffectHandle } from './nodes/effects'
import { VideoPool, type VideoSlot } from './video/VideoSource'

interface ActiveEffect {
  id: string
  handle: EffectHandle
  get: (key: string) => number
}

export class Engine {
  readonly canvas = document.createElement('canvas')
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly material = new MeshBasicMaterial({ color: 0xffffff })
  private readonly plane = new Mesh(new PlaneGeometry(2, 2), this.material)
  private composer: EffectComposer | null = null
  private effects: ActiveEffect[] = []
  private readonly pool: VideoPool
  private readonly audio: AudioInput
  private readonly resizeObserver: ResizeObserver

  private nodes = new Map<string, GraphNode>()
  private compiled: CompiledGraph = compileGraph({ version: 1, nodes: [], edges: [] })
  private readonly bus = new SignalBus(this.compiled, this.nodes)
  private state: AppState | null = null

  private raf = 0
  private lastFrame = 0
  private lastAudioSend = 0
  private width = 1
  private height = 1
  private resolution = 1

  constructor(
    private readonly container: HTMLElement,
    private readonly mediaKey: string,
    onAudioStatus: (status: AudioStatus) => void
  ) {
    this.canvas.style.cssText = 'display:block;width:100%;height:100%'
    container.appendChild(this.canvas)
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      powerPreference: 'high-performance',
      antialias: false,
      stencil: false,
      depth: false
    })
    this.renderer.setClearColor(0x000000, 1)
    this.plane.visible = false
    this.scene.add(this.plane)

    this.pool = new VideoPool((slot) => this.onVideoSwap(slot))
    this.audio = new AudioInput(onAudioStatus)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.rebuild()
  }

  setState(state: AppState): void {
    this.state = state
    this.nodes = new Map(state.graph.nodes.map((n) => [n.id, { ...n, params: { ...n.params } }]))
    const prevKey = this.compiled.chainKey
    this.compiled = compileGraph(state.graph)
    this.bus.setGraph(this.compiled, this.nodes)
    if (this.compiled.chainKey !== prevKey || !this.composer) this.rebuild()
    this.updateVideo()
    this.audio.request(state.audio.deviceId)
  }

  patchParam(nodeId: string, key: string, value: ParamValue): void {
    const node = this.nodes.get(nodeId)
    if (!node) return
    node.params = { ...node.params, [key]: value }
    if (node.type === 'VideoFile' && key === 'videoId') this.updateVideo()
  }

  start(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.resizeObserver.disconnect()
    this.audio.dispose()
    this.pool.dispose()
    this.composer?.dispose()
    this.material.dispose()
    this.plane.geometry.dispose()
    this.renderer.dispose()
    this.canvas.remove()
  }

  /** Plik do odtwarzania: z node'a źródła, a gdy go nie ma w bibliotece – aktywne wideo. */
  private updateVideo(): void {
    const state = this.state
    if (!state) return
    const source = this.compiled.sourceId ? this.nodes.get(this.compiled.sourceId) : undefined
    let id: string | null = null
    if (source) {
      const fixed = source.params.videoId
      id =
        typeof fixed === 'string' && state.library.some((v) => v.id === fixed)
          ? fixed
          : state.activeId
    }
    const base = state.server.localUrl
    this.pool.request(
      id && base ? `${base}/media/${encodeURIComponent(id)}?k=${this.mediaKey}` : null
    )
  }

  private onVideoSwap(slot: VideoSlot | null): void {
    this.material.map = slot?.texture ?? null
    this.material.needsUpdate = true
    this.plane.visible = slot !== null
  }

  /** Przebudowa przejść efektów – tylko przy zmianie łańcucha filtrów. */
  private rebuild(): void {
    this.composer?.dispose()
    const composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType })
    composer.addPass(new RenderPass(this.scene, this.camera))
    this.effects = []
    for (const id of this.compiled.filterIds) {
      const node = this.nodes.get(id)
      const handle = node && createEffect(node.type)
      if (!handle) continue
      // Osobne przejście na efekt: zachowuje kolejność z grafu i pozwala łączyć
      // efekty, których postprocessing nie scala w jednym przejściu.
      composer.addPass(new EffectPass(this.camera, handle.effect))
      this.effects.push({ id, handle, get: (key) => this.bus.number(id, key) })
    }
    composer.setSize(this.width, this.height, false)
    this.composer = composer
  }

  private resize(): void {
    this.width = Math.max(1, this.container.clientWidth)
    this.height = Math.max(1, this.container.clientHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio * this.resolution)
    this.renderer.setSize(this.width, this.height, false)
    this.composer?.setSize(this.width, this.height, false)
  }

  /** Dopasowanie wideo do okna z zachowaniem proporcji (letterbox). */
  private fitPlane(): void {
    const video = this.pool.active?.video
    if (!video || !video.videoWidth) return
    const videoAspect = video.videoWidth / video.videoHeight
    const viewAspect = this.width / this.height
    if (videoAspect > viewAspect) this.plane.scale.set(1, viewAspect / videoAspect, 1)
    else this.plane.scale.set(videoAspect / viewAspect, 1, 1)
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame)
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0
    this.lastFrame = now

    const levels = this.audio.update(now)
    this.bus.evaluate(levels, dt)

    const sourceId = this.compiled.sourceId
    if (sourceId) {
      this.pool.setSpeed(this.bus.number(sourceId, 'speed'))
      this.pool.setLoop(this.nodes.get(sourceId)?.params.loop !== false)
    }

    if (this.compiled.outputId) {
      const res = Math.round(this.bus.number(this.compiled.outputId, 'resolution') * 20) / 20
      if (res !== this.resolution) {
        this.resolution = res
        this.resize()
      }
    }

    for (const e of this.effects) e.handle.apply(e.get)
    this.fitPlane()
    this.composer?.render(dt)

    if (now - this.lastAudioSend >= AUDIO_SEND_INTERVAL_MS) {
      this.lastAudioSend = now
      window.api.sendAudio(levels)
    }
  }
}
