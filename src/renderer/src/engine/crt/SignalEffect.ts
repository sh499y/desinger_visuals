// CRT Signal jako efekt postprocessing. Wartości zależne od czasu liczy SignalModel.

import { Effect, EffectAttribute } from 'postprocessing'
import { Uniform } from 'three'
import type { SignalUniforms } from './model'
import fragment from './signal.frag?raw'

const KEYS = [
  'humAmp',
  'humBar',
  'humPhase',
  'jitterAmp',
  'jitterTime',
  'chromaBleed',
  'chromaSat',
  'chromaHue'
] as const satisfies readonly (keyof SignalUniforms)[]

export class SignalEffect extends Effect {
  constructor() {
    super('CRTSignal', fragment, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>(
        KEYS.map((k) => [k, new Uniform(k === 'chromaSat' ? 1 : 0)])
      )
    })
  }

  setSignal(s: SignalUniforms): void {
    for (const k of KEYS) this.uniforms.get(k)!.value = s[k]
  }
}
