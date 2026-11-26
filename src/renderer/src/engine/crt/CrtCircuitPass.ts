// CRT Circuit jako własne przejście: potrzebuje średniej jasności klatki
// (spadek HV) i poprzedniej klatki (poświata luminoforu), czego zwykły Effect
// nie ma. Kolejność w render(): luma → kineskop do bufora poświaty → wyjście.

import { CopyMaterial, Pass } from 'postprocessing'
import {
  HalfFloatType,
  LinearMipmapLinearFilter,
  ShaderMaterial,
  Uniform,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer
} from 'three'
import { CircuitModel, type CircuitKnobs } from './model'
import fragmentShader from './circuit.frag?raw'
import vertexShader from './fullscreen.vert?raw'

/** Czasy zaniku luminoforu P22 [s]: R, G, B. */
const TAU = new Vector3(0.04, 0.06, 0.02)
const LUMA_SIZE = 64

export class CrtCircuitPass extends Pass {
  readonly model = new CircuitModel()
  private readonly luma = new WebGLRenderTarget(LUMA_SIZE, LUMA_SIZE, {
    type: HalfFloatType,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter
  })
  private readonly phosphor = [0, 1].map(
    () => new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false })
  )
  private current = 0
  private readonly copy = new CopyMaterial()
  private readonly tube: ShaderMaterial
  private readonly u: Record<string, Uniform>

  constructor() {
    super('CrtCircuitPass')
    this.u = {
      inputBuffer: new Uniform(null),
      lumaBuffer: new Uniform(this.luma.texture),
      prevBuffer: new Uniform(null),
      resolution: new Uniform(new Vector2(1, 1)),
      time: new Uniform(0),
      decay: new Uniform(new Vector3()),
      scale: new Uniform(new Vector2(1, 1)),
      lin: new Uniform(new Vector2()),
      pincushion: new Uniform(0),
      hvRatio: new Uniform(1),
      brightness: new Uniform(1),
      focus: new Uniform(1),
      jitter: new Uniform(0),
      hDetune: new Uniform(0),
      hPhase: new Uniform(0),
      vRolling: new Uniform(0),
      vPhase: new Uniform(0),
      arc: new Uniform(0)
    }
    this.tube = new ShaderMaterial({
      uniforms: this.u,
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false
    })
    this.fullscreenMaterial = this.tube
  }

  /** Raz na klatkę: krok modelu i przepisanie wyników do uniformów (bez alokacji). */
  setKnobs(knobs: CircuitKnobs, dt: number): void {
    const o = this.model.step(knobs, dt, Math.random)
    const u = this.u
    u.time.value += dt
    ;(u.decay.value as Vector3).set(
      Math.exp(-dt / TAU.x),
      Math.exp(-dt / TAU.y),
      Math.exp(-dt / TAU.z)
    )
    ;(u.scale.value as Vector2).set(o.scaleX, o.scaleY)
    ;(u.lin.value as Vector2).set(o.linH, o.linV)
    u.pincushion.value = o.pincushion
    u.hvRatio.value = o.hvRatio
    u.brightness.value = o.brightness
    u.focus.value = o.focus
    u.jitter.value = o.jitter
    u.hDetune.value = o.hDetune
    u.hPhase.value = o.hPhase
    u.vRolling.value = o.vRolling
    u.vPhase.value = o.vPhase
    u.arc.value = o.arc
  }

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget | null,
    outputBuffer: WebGLRenderTarget | null
  ): void {
    if (!inputBuffer) return
    const target = this.phosphor[this.current]
    const prev = this.phosphor[this.current ^ 1]

    this.copy.inputBuffer = inputBuffer.texture
    this.fullscreenMaterial = this.copy
    renderer.setRenderTarget(this.luma)
    renderer.render(this.scene, this.camera)

    this.u.inputBuffer.value = inputBuffer.texture
    this.u.prevBuffer.value = prev.texture
    this.fullscreenMaterial = this.tube
    renderer.setRenderTarget(target)
    renderer.render(this.scene, this.camera)

    this.copy.inputBuffer = target.texture
    this.fullscreenMaterial = this.copy
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)

    this.current ^= 1
  }

  override setSize(width: number, height: number): void {
    for (const t of this.phosphor) t.setSize(width, height)
    ;(this.u.resolution.value as Vector2).set(width, height)
  }

  override dispose(): void {
    for (const t of this.phosphor) t.dispose()
    this.luma.dispose()
    this.copy.dispose()
    this.tube.dispose()
    super.dispose()
  }
}
