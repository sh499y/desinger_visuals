// Node'y filtrów → gotowe efekty z biblioteki `postprocessing`.
// `apply` jest wołane w każdej klatce i tylko ustawia wartości (bez alokacji).

import {
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  type Effect,
  GlitchEffect,
  GlitchMode,
  HueSaturationEffect,
  NoiseEffect,
  PixelationEffect,
  VignetteEffect
} from 'postprocessing'
import { Vector2 } from 'three'
import type { NodeType } from '@shared/nodes'

export type ParamGetter = (key: string) => number

export interface EffectHandle {
  effect: Effect
  apply(get: ParamGetter): void
}

const DEG = Math.PI / 180

export function createEffect(type: NodeType): EffectHandle | null {
  switch (type) {
    case 'BrightnessContrast': {
      const effect = new BrightnessContrastEffect()
      return {
        effect,
        apply(get) {
          effect.brightness = get('brightness')
          effect.contrast = get('contrast')
        }
      }
    }
    case 'HueSaturation': {
      const effect = new HueSaturationEffect()
      return {
        effect,
        apply(get) {
          effect.hue = get('hue') * DEG
          effect.saturation = get('saturation')
        }
      }
    }
    case 'Bloom': {
      const effect = new BloomEffect({ mipmapBlur: true, radius: 0.75, luminanceSmoothing: 0.2 })
      return {
        effect,
        apply(get) {
          effect.intensity = get('intensity')
          effect.luminanceMaterial.threshold = get('threshold')
        }
      }
    }
    case 'RGBSplit': {
      const effect = new ChromaticAberrationEffect({
        offset: new Vector2(),
        radialModulation: false,
        modulationOffset: 0
      })
      return {
        effect,
        apply(get) {
          const a = get('amount')
          const angle = get('angle') * DEG
          effect.offset.set(Math.cos(angle) * a, Math.sin(angle) * a)
        }
      }
    }
    case 'Pixelate': {
      const effect = new PixelationEffect(0)
      return {
        effect,
        apply(get) {
          const g = Math.round(get('granularity'))
          if (g !== effect.granularity) effect.granularity = g
        }
      }
    }
    case 'Glitch': {
      const effect = new GlitchEffect({ ratio: 0.85, columns: 0.05 })
      effect.mode = GlitchMode.DISABLED
      return {
        effect,
        apply(get) {
          const a = get('amount')
          effect.mode =
            a < 0.02
              ? GlitchMode.DISABLED
              : a < 0.6
                ? GlitchMode.CONSTANT_MILD
                : GlitchMode.CONSTANT_WILD
          effect.strength.set(a * 0.3, a)
        }
      }
    }
    case 'Noise': {
      const effect = new NoiseEffect({ premultiply: true })
      return {
        effect,
        apply(get) {
          effect.blendMode.opacity.value = get('opacity')
        }
      }
    }
    case 'Vignette': {
      const effect = new VignetteEffect()
      return {
        effect,
        apply(get) {
          effect.offset = get('offset')
          effect.darkness = get('darkness')
        }
      }
    }
    default:
      return null
  }
}
