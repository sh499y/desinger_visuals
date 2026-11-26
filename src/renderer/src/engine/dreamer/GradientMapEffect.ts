// Dreamer Gradient jako efekt postprocessing. Mapy A i B to tekstury 256×1 (sRGB),
// przeliczane tylko przy zmianie tekstu gradientu; zły tekst zostawia poprzednią mapę.

import { Effect } from 'postprocessing'
import { DataTexture, LinearFilter, RGBAFormat, SRGBColorSpace, Uniform } from 'three'
import { parseGradient, sampleGradient } from '@shared/gradient'
import fragment from './gradient.frag?raw'

export const LUT_SIZE = 256

export class GradientLut {
  readonly texture: DataTexture
  private readonly data = new Uint8Array(LUT_SIZE * 4)
  private readonly rgb = new Float32Array(3)
  private source: string | null = null

  constructor() {
    this.texture = new DataTexture(this.data, LUT_SIZE, 1, RGBAFormat)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.magFilter = LinearFilter
    this.texture.minFilter = LinearFilter
  }

  /** Przelicza mapę, gdy tekst się zmienił i jest poprawny. Zwraca, czy przeliczył. */
  set(value: string): boolean {
    if (value === this.source) return false
    this.source = value
    const stops = parseGradient(value)
    if (!stops) return false
    for (let i = 0; i < LUT_SIZE; i++) {
      sampleGradient(stops, i / (LUT_SIZE - 1), this.rgb)
      for (let c = 0; c < 3; c++) this.data[i * 4 + c] = Math.round(this.rgb[c] * 255)
      this.data[i * 4 + 3] = 255
    }
    this.texture.needsUpdate = true
    return true
  }

  dispose(): void {
    this.texture.dispose()
  }
}

export class GradientMapEffect extends Effect {
  readonly a = new GradientLut()
  readonly b = new GradientLut()

  constructor() {
    super('DreamerGradient', fragment, {
      uniforms: new Map<string, Uniform>([
        ['lutA', new Uniform(null)],
        ['lutB', new Uniform(null)],
        ['mixAB', new Uniform(0)],
        ['shift', new Uniform(0)],
        ['contrast', new Uniform(0)],
        ['steps', new Uniform(0)],
        ['reverse', new Uniform(0)],
        ['opacity', new Uniform(1)]
      ])
    })
    this.uniforms.get('lutA')!.value = this.a.texture
    this.uniforms.get('lutB')!.value = this.b.texture
  }

  setValues(
    mix: number,
    shift: number,
    contrast: number,
    steps: number,
    reverse: boolean,
    opacity: number
  ): void {
    const u = this.uniforms
    u.get('mixAB')!.value = mix
    u.get('shift')!.value = shift
    u.get('contrast')!.value = contrast
    u.get('steps')!.value = Math.round(steps)
    u.get('reverse')!.value = reverse ? 1 : 0
    u.get('opacity')!.value = opacity
  }

  override dispose(): void {
    this.a.dispose()
    this.b.dispose()
    super.dispose()
  }
}
