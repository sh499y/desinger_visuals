// Dreamer Blur jako własne przejście. Kolejność w render():
// 1. klatka → bufor z mipmapami (piramida: każdy poziom to średnia 2×2),
// 2. Gaussian / Band / Ellipse: rozdzielne gaussiany (po dwa przebiegi) na poziomie piramidy,
//    który trzyma kernel mały; Band i Ellipse liczą cztery: σ/8, σ/4, σ/2, σ,
// 3. złożenie (blur.frag) do wyjścia. Siła 0 = sama kopia.

import { CopyMaterial, Pass } from 'postprocessing'
import {
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  ShaderMaterial,
  Uniform,
  Vector2,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer
} from 'three'
import vertexShader from '../crt/fullscreen.vert?raw'
import blurFragment from './blur.frag?raw'
import gaussFragment from './gauss.frag?raw'
import { blurUniforms, emptyBlur, gaussLevel, type DreamerBlurParams } from './model'

/** Rozmycia dla Band / Ellipse jako ułamki σ. */
const BAND_STEPS = [0.125, 0.25, 0.5, 1] as const
/** Poniżej tego σ (px) gaussian nic nie zmienia. */
const MIN_SIGMA = 0.3

const target = (mips = false): WebGLRenderTarget =>
  new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: false,
    generateMipmaps: mips,
    minFilter: mips ? LinearMipmapLinearFilter : LinearFilter,
    magFilter: LinearFilter
  })

export class DreamerBlurPass extends Pass {
  readonly params: DreamerBlurParams = {
    amount: 0,
    angle: 0,
    centerX: 0.5,
    centerY: 0.5,
    focus: 0.3,
    feather: 0.5
  }
  kind = 0

  private readonly blur = emptyBlur()
  private readonly mip = target(true)
  private readonly tmp = BAND_STEPS.map(() => target())
  private readonly out = BAND_STEPS.map(() => target())
  private readonly copy = new CopyMaterial()
  private readonly gauss: ShaderMaterial
  private readonly composite: ShaderMaterial
  private width = 1
  private height = 1

  constructor() {
    super('DreamerBlurPass')
    this.gauss = new ShaderMaterial({
      uniforms: {
        inputBuffer: new Uniform<Texture | null>(null),
        lod: new Uniform(0),
        texel: new Uniform(new Vector2()),
        sigma: new Uniform(1)
      },
      vertexShader,
      fragmentShader: gaussFragment,
      depthTest: false,
      depthWrite: false
    })
    this.composite = new ShaderMaterial({
      uniforms: {
        inputBuffer: new Uniform<Texture | null>(null),
        mipBuffer: new Uniform(this.mip.texture),
        g0: new Uniform(this.out[0].texture),
        g1: new Uniform(this.out[1].texture),
        g2: new Uniform(this.out[2].texture),
        g3: new Uniform(this.out[3].texture),
        resolution: new Uniform(new Vector2(1, 1)),
        maxLod: new Uniform(0),
        kind: new Uniform(0),
        len: new Uniform(0),
        dir: new Uniform(new Vector2(1, 0)),
        theta: new Uniform(0),
        reach: new Uniform(0),
        center: new Uniform(new Vector2()),
        angle: new Uniform(0),
        bandHalf: new Uniform(0),
        bandOuter: new Uniform(0),
        radii: new Uniform(new Vector2(1, 1)),
        outer: new Uniform(1)
      },
      vertexShader,
      fragmentShader: blurFragment,
      depthTest: false,
      depthWrite: false
    })
    this.fullscreenMaterial = this.composite
  }

  /** Czy przy obecnych parametrach przejście cokolwiek zmienia. */
  get active(): boolean {
    return this.params.amount > 0
  }

  private draw(renderer: WebGLRenderer, rt: WebGLRenderTarget | null): void {
    renderer.setRenderTarget(rt)
    renderer.render(this.scene, this.camera)
  }

  /** Gaussian σ pikseli pełnej klatki z piramidy do `out[slot]`. */
  private gaussian(renderer: WebGLRenderer, slot: number, sigma: number, maxLod: number): void {
    const l = Math.min(gaussLevel(sigma), maxLod)
    const w = Math.max(1, this.width >> l)
    const h = Math.max(1, this.height >> l)
    const tmp = this.tmp[slot]
    const out = this.out[slot]
    if (tmp.width !== w || tmp.height !== h) {
      tmp.setSize(w, h)
      out.setSize(w, h)
    }
    const u = this.gauss.uniforms
    u.sigma.value = sigma / (1 << l)
    this.fullscreenMaterial = this.gauss
    u.inputBuffer.value = this.mip.texture
    u.lod.value = l
    ;(u.texel.value as Vector2).set(1 / w, 0)
    this.draw(renderer, tmp)
    u.inputBuffer.value = tmp.texture
    u.lod.value = 0
    ;(u.texel.value as Vector2).set(0, 1 / h)
    this.draw(renderer, out)
  }

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget | null,
    outputBuffer: WebGLRenderTarget | null
  ): void {
    if (!inputBuffer) return
    const dest = this.renderToScreen ? null : outputBuffer
    blurUniforms(this.kind, this.params, this.width, this.height, this.blur)
    const b = this.blur
    const pathKind = b.kind >= 1 && b.kind <= 3
    if (!this.active || (!pathKind && b.sigma < MIN_SIGMA)) {
      this.copy.inputBuffer = inputBuffer.texture
      this.fullscreenMaterial = this.copy
      this.draw(renderer, dest)
      return
    }

    this.copy.inputBuffer = inputBuffer.texture
    this.fullscreenMaterial = this.copy
    this.draw(renderer, this.mip)
    const maxLod = Math.floor(Math.log2(Math.max(this.width, this.height)))

    if (b.kind === 0) this.gaussian(renderer, 0, b.sigma, maxLod)
    else if (!pathKind) {
      for (let i = 0; i < BAND_STEPS.length; i++) {
        this.gaussian(renderer, i, Math.max(MIN_SIGMA, b.sigma * BAND_STEPS[i]), maxLod)
      }
    }

    const u = this.composite.uniforms
    u.inputBuffer.value = inputBuffer.texture
    ;(u.resolution.value as Vector2).set(this.width, this.height)
    u.maxLod.value = maxLod
    u.kind.value = b.kind
    u.len.value = b.len
    ;(u.dir.value as Vector2).set(b.dirX, b.dirY)
    u.theta.value = b.theta
    u.reach.value = b.reach
    ;(u.center.value as Vector2).set(b.geom.cx, b.geom.cy)
    u.angle.value = b.geom.angle
    u.bandHalf.value = b.geom.bandHalf
    u.bandOuter.value = b.geom.bandOuter
    ;(u.radii.value as Vector2).set(b.geom.rx, b.geom.ry)
    u.outer.value = b.geom.outer
    this.fullscreenMaterial = this.composite
    this.draw(renderer, dest)
  }

  override setSize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.mip.setSize(this.width, this.height)
  }

  override dispose(): void {
    this.mip.dispose()
    for (const t of [...this.tmp, ...this.out]) t.dispose()
    this.copy.dispose()
    this.gauss.dispose()
    this.composite.dispose()
    super.dispose()
  }
}
