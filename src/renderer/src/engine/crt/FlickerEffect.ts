// CRT Flicker jako efekt postprocessing: błyski czarnych/białych klatek z FlickerModel.

import { Effect } from 'postprocessing'
import { Uniform } from 'three'
import type { FlickerUniforms } from './model'
import fragment from './flicker.frag?raw'

export class FlickerEffect extends Effect {
  constructor() {
    super('CRTFlicker', fragment, {
      uniforms: new Map([
        ['flash', new Uniform(0)],
        ['flashTone', new Uniform(0)]
      ])
    })
  }

  setFlash(f: FlickerUniforms): void {
    this.uniforms.get('flash')!.value = f.mix
    this.uniforms.get('flashTone')!.value = f.tone
  }
}
