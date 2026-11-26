// CRT Guns jako efekt postprocessing. Wartości liczy model (gunUniforms),
// shader tylko próbkuje i rysuje.

import { Effect, EffectAttribute } from 'postprocessing'
import { Uniform, Vector3 } from 'three'
import type { GunUniforms } from './model'
import fragment from './guns.frag?raw'

export class GunsEffect extends Effect {
  private readonly gain: Vector3
  private readonly convergence: Vector3
  private readonly overdrive: Vector3

  constructor() {
    super('CRTGuns', fragment, {
      // Próbkuje sąsiednie piksele, więc nie może być scalony z innymi efektami.
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['gain', new Uniform(new Vector3(1, 1, 1))],
        ['convergence', new Uniform(new Vector3())],
        ['overdrive', new Uniform(new Vector3())]
      ])
    })
    this.gain = this.uniforms.get('gain')!.value as Vector3
    this.convergence = this.uniforms.get('convergence')!.value as Vector3
    this.overdrive = this.uniforms.get('overdrive')!.value as Vector3
  }

  setGuns(r: GunUniforms, g: GunUniforms, b: GunUniforms): void {
    this.gain.set(r.gain, g.gain, b.gain)
    this.convergence.set(r.convergence, g.convergence, b.convergence)
    this.overdrive.set(r.overdrive, g.overdrive, b.overdrive)
  }
}
