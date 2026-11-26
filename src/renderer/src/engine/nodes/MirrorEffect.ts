// Mirror: odbicie lustrzane względem osi przez środek kadru pod zadanym kątem.
// Strona wskazana przez normalną zostaje, druga jest jej odbiciem.

import { Effect, EffectAttribute } from 'postprocessing'
import { Uniform, Vector2 } from 'three'
import fragment from './mirror.frag?raw'

const DEG = Math.PI / 180

/**
 * Normalna strony, która zostaje, dla osi pod kątem `angle` (°):
 * 0° = oś pozioma (góra odbita na dół), 90° = pionowa (lewo na prawo).
 */
export function mirrorNormal(angle: number, out: Vector2): Vector2 {
  const a = angle * DEG
  return out.set(-Math.sin(a), Math.cos(a))
}

export class MirrorEffect extends Effect {
  constructor() {
    super('Mirror', fragment, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([['normal', new Uniform(new Vector2(-1, 0))]])
    })
  }

  setAngle(angle: number): void {
    mirrorNormal(angle, this.uniforms.get('normal')!.value as Vector2)
  }
}
