// CRT Tube jako własne przejście: halacja potrzebuje szerokiego rozmycia, więc
// klatka idzie najpierw do bufora o połowie rozdzielczości z mipmapami
// (każdy poziom to uśrednienie 2×2, bez aliasingu rastra), a shader szkła
// czyta kilka poziomów naraz. Kolejność w render(): pół rozdzielczości → szkło.

import { CopyMaterial, Pass } from 'postprocessing'
import {
  HalfFloatType,
  LinearMipmapLinearFilter,
  ShaderMaterial,
  Uniform,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer
} from 'three'
import type { TubeUniforms } from './model'
import fragmentShader from './tube.frag?raw'
import vertexShader from './fullscreen.vert?raw'

export class CrtTubePass extends Pass {
  readonly uniforms: {
    inputBuffer: Uniform<Texture | null>
    glowBuffer: Uniform<Texture>
    glowGain: Uniform<number>
    gamma: Uniform<number>
    saturation: Uniform<number>
  }
  private readonly half = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter
  })
  private readonly copy = new CopyMaterial()
  private readonly glass: ShaderMaterial

  constructor() {
    super('CrtTubePass')
    this.uniforms = {
      inputBuffer: new Uniform(null),
      glowBuffer: new Uniform(this.half.texture),
      glowGain: new Uniform(0),
      gamma: new Uniform(1),
      saturation: new Uniform(1)
    }
    this.glass = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false
    })
    this.fullscreenMaterial = this.glass
  }

  setTube(t: TubeUniforms): void {
    this.uniforms.glowGain.value = t.glowGain
    this.uniforms.gamma.value = t.gamma
    this.uniforms.saturation.value = t.saturation
  }

  override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget | null,
    outputBuffer: WebGLRenderTarget | null
  ): void {
    if (!inputBuffer) return
    if (this.uniforms.glowGain.value > 0) {
      this.copy.inputBuffer = inputBuffer.texture
      this.fullscreenMaterial = this.copy
      renderer.setRenderTarget(this.half)
      renderer.render(this.scene, this.camera)
    }

    this.uniforms.inputBuffer.value = inputBuffer.texture
    this.fullscreenMaterial = this.glass
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer)
    renderer.render(this.scene, this.camera)
  }

  override setSize(width: number, height: number): void {
    this.half.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)))
  }

  override dispose(): void {
    this.half.dispose()
    this.copy.dispose()
    this.glass.dispose()
    super.dispose()
  }
}
