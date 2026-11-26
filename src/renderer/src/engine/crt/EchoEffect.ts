// CRT Echo jako efekt postprocessing. Wartości liczy echoUniforms (model.ts).

import { Effect, EffectAttribute } from 'postprocessing'
import { Uniform, Vector3 } from 'three'
import type { EchoUniforms } from './model'
import fragment from './echo.frag?raw'

export class EchoEffect extends Effect {
  private readonly delay: Vector3

  constructor() {
    super('CRTEcho', fragment, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['echoGain', new Uniform(0)],
        ['echoDelay', new Uniform(new Vector3())],
        ['spreadShift', new Uniform(0)]
      ])
    })
    this.delay = this.uniforms.get('echoDelay')!.value as Vector3
  }

  setEcho(e: EchoUniforms): void {
    this.uniforms.get('echoGain')!.value = e.echoGain
    this.delay.set(e.delayR, e.delayG, e.delayB)
    this.uniforms.get('spreadShift')!.value = e.spreadShift
  }
}
