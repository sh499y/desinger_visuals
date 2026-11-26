// Posterize Time: obraz odświeżany tylko N razy na sekundę (poklatkowo), jak
// efekt o tej nazwie w After Effects. Przejście trzyma kopię ostatniej
// przepuszczonej klatki i pokazuje ją, dopóki zegar nie wybije następnej.

import { CopyMaterial, Pass } from 'postprocessing'
import { HalfFloatType, WebGLRenderTarget, type WebGLRenderer } from 'three'

const FPS_MIN = 1
const FPS_MAX = 30

/** Zegar klatek: `tick` zwraca true, gdy należy przepuścić nową klatkę. */
export class FrameClock {
  private acc = Infinity

  tick(fps: number, dt: number): boolean {
    const f = fps > FPS_MAX ? FPS_MAX : fps > FPS_MIN ? fps : FPS_MIN
    const period = 1 / f
    this.acc += Math.max(dt, 0)
    if (this.acc < period - 1e-9) return false
    this.acc -= period
    // Po długiej przerwie nie nadrabiamy zaległych klatek.
    if (this.acc > period) this.acc = 0
    return true
  }
}

export class PosterizeTimePass extends Pass {
  /** Czy w tej klatce przepuścić nowy obraz (ustawiane w `tick`). */
  capture = true
  /** Bufor po zmianie rozmiaru jest pusty: następna klatka musi trafić do niego. */
  private stale = true
  private readonly clock = new FrameClock()
  private readonly hold = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false })
  private readonly copy = new CopyMaterial()

  constructor() {
    super('PosterizeTimePass')
    this.fullscreenMaterial = this.copy
  }

  /** Raz na klatkę, przed renderowaniem. */
  tick(fps: number, dt: number): void {
    this.capture = this.clock.tick(fps, dt)
  }

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget | null,
    outputBuffer: WebGLRenderTarget | null
  ): void {
    if (!inputBuffer) return
    if (this.capture || this.stale) {
      this.stale = false
      this.copy.inputBuffer = inputBuffer.texture
      renderer.setRenderTarget(this.hold)
      renderer.render(this.scene, this.camera)
    }
    this.copy.inputBuffer = this.hold.texture
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }

  override setSize(width: number, height: number): void {
    this.hold.setSize(width, height)
    this.stale = true
  }

  override dispose(): void {
    this.hold.dispose()
    this.copy.dispose()
    super.dispose()
  }
}
