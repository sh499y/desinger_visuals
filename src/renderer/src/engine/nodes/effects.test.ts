import { describe, expect, it } from 'vitest'
import {
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  GlitchEffect,
  GlitchMode,
  HueSaturationEffect,
  NoiseEffect,
  PixelationEffect,
  VignetteEffect
} from 'postprocessing'
import { FILTER_TYPES, NODE_TYPES, NODE_DEFS } from '@shared/nodes'
import { Vector2, Vector3 } from 'three'
import { CrtCircuitPass } from '../crt/CrtCircuitPass'
import { EchoEffect } from '../crt/EchoEffect'
import { GunsEffect } from '../crt/GunsEffect'
import { SignalEffect } from '../crt/SignalEffect'
import { CrtTubePass } from '../crt/CrtTubePass'
import { FlickerEffect } from '../crt/FlickerEffect'
import { createEffect, type EffectHandle } from './effects'
import { MirrorEffect, mirrorNormal } from './MirrorEffect'
import { FrameClock, PosterizeTimePass } from './PosterizeTimePass'

/** Getter jak w silniku: wartości z mapy, reszta z domyślnych. */
const getter =
  (values: Record<string, number>) =>
  (key: string): number =>
    values[key] ?? 0

function make<T>(
  type: Parameters<typeof createEffect>[0],
  cls: new (...a: never[]) => T
): {
  handle: EffectHandle
  effect: T
} {
  const handle = createEffect(type)!
  expect(handle.effect).toBeInstanceOf(cls)
  return { handle, effect: handle.effect as T }
}

describe('createEffect', () => {
  it.each(FILTER_TYPES)('%s ma efekt, który przyjmuje domyślne parametry', (type) => {
    const handle = createEffect(type)
    expect(handle).not.toBeNull()
    expect(handle!.effect ?? handle!.pass).toBeTruthy()
    const defaults: Record<string, number> = {}
    for (const p of NODE_DEFS[type].params) if (p.kind === 'number') defaults[p.key] = p.default
    expect(() => handle!.apply(getter(defaults), 1 / 60)).not.toThrow()
    handle!.effect?.dispose()
    handle!.pass?.dispose()
  })

  it('node’y, które nie są filtrami, nie mają efektu', () => {
    for (const type of NODE_TYPES.filter((t) => !FILTER_TYPES.includes(t))) {
      expect(createEffect(type)).toBeNull()
    }
  })
})

describe('mapowanie parametrów', () => {
  it('BrightnessContrast', () => {
    const { handle, effect } = make('BrightnessContrast', BrightnessContrastEffect)
    handle.apply(getter({ brightness: 0.2, contrast: -0.3 }), 1 / 60)
    expect(effect.brightness).toBeCloseTo(0.2)
    expect(effect.contrast).toBeCloseTo(-0.3)
  })

  it('HueSaturation: stopnie → radiany', () => {
    const { handle, effect } = make('HueSaturation', HueSaturationEffect)
    handle.apply(getter({ hue: 90, saturation: 0.5 }), 1 / 60)
    expect(effect.hue).toBeCloseTo(Math.PI / 2)
    expect(effect.saturation).toBeCloseTo(0.5)
  })

  it('Bloom: intensywność i próg', () => {
    const { handle, effect } = make('Bloom', BloomEffect)
    handle.apply(getter({ intensity: 3, threshold: 0.7 }), 1 / 60)
    expect(effect.intensity).toBe(3)
    expect(effect.luminanceMaterial.threshold).toBeCloseTo(0.7)
  })

  it('RGBSplit: przesunięcie i kąt → wektor', () => {
    const { handle, effect } = make('RGBSplit', ChromaticAberrationEffect)
    handle.apply(getter({ amount: 0.01, angle: 90 }), 1 / 60)
    expect(effect.offset.x).toBeCloseTo(0)
    expect(effect.offset.y).toBeCloseTo(0.01)
    handle.apply(getter({ amount: 0.02, angle: 0 }), 1 / 60)
    expect(effect.offset.x).toBeCloseTo(0.02)
  })

  it('Pixelate zaokrągla rozmiar piksela', () => {
    const { handle, effect } = make('Pixelate', PixelationEffect)
    handle.apply(getter({ granularity: 3.6 }), 1 / 60)
    expect(effect.granularity).toBe(4)
  })

  it('Glitch: tryb zależy od siły', () => {
    const { handle, effect } = make('Glitch', GlitchEffect)
    handle.apply(getter({ amount: 0 }), 1 / 60)
    expect(effect.mode).toBe(GlitchMode.DISABLED)
    handle.apply(getter({ amount: 0.3 }), 1 / 60)
    expect(effect.mode).toBe(GlitchMode.CONSTANT_MILD)
    expect(effect.strength.y).toBeCloseTo(0.3)
    handle.apply(getter({ amount: 0.9 }), 1 / 60)
    expect(effect.mode).toBe(GlitchMode.CONSTANT_WILD)
  })

  it('Noise: krycie przez blend mode', () => {
    const { handle, effect } = make('Noise', NoiseEffect)
    handle.apply(getter({ opacity: 0.4 }), 1 / 60)
    expect(effect.blendMode.opacity.value).toBeCloseTo(0.4)
  })

  it('Vignette', () => {
    const { handle, effect } = make('Vignette', VignetteEffect)
    handle.apply(getter({ offset: 0.5, darkness: 0.8 }), 1 / 60)
    expect(effect.offset).toBeCloseTo(0.5)
    expect(effect.darkness).toBeCloseTo(0.8)
  })

  it('PosterizeTime: własne przejście, FPS trafia do zegara klatek', () => {
    const handle = createEffect('PosterizeTime')!
    expect(handle.pass).toBeInstanceOf(PosterizeTimePass)
    const pass = handle.pass as PosterizeTimePass
    handle.apply(getter({ fps: 10 }), 1 / 60)
    expect(pass.capture).toBe(true) // pierwsza klatka zawsze
    handle.apply(getter({ fps: 10 }), 1 / 60)
    expect(pass.capture).toBe(false)
    pass.dispose()
  })

  it('Mirror: kąt osi → normalna strony, która zostaje', () => {
    const { handle, effect } = make('Mirror', MirrorEffect)
    handle.apply(getter({ angle: 90 }), 1 / 60)
    const n = effect.uniforms.get('normal')!.value as Vector2
    // oś pionowa: zostaje lewa połowa (x < 0), odbita na prawą
    expect(n.x).toBeCloseTo(-1)
    expect(n.y).toBeCloseTo(0)
  })

  it('Mirror: odległość osi od środka → uniform offset', () => {
    const { handle, effect } = make('Mirror', MirrorEffect)
    handle.apply(getter({ angle: 90, offset: 0.25 }), 1 / 60)
    expect(effect.uniforms.get('offset')!.value).toBe(0.25)
    handle.apply(getter({ angle: 90 }), 1 / 60)
    expect(effect.uniforms.get('offset')!.value).toBe(0) // stare projekty bez offsetu: oś przez środek
  })

  it('Mirror: miękkość krawędzi → uniform softness', () => {
    const { handle, effect } = make('Mirror', MirrorEffect)
    handle.apply(getter({ angle: 90, softness: 0.1 }), 1 / 60)
    expect(effect.uniforms.get('softness')!.value).toBe(0.1)
  })

  it('mirrorNormal: 0° = oś pozioma (góra na dół), 45° = przekątna', () => {
    const out = new Vector2()
    expect(mirrorNormal(0, out)).toBe(out)
    expect(out.x).toBeCloseTo(0)
    expect(out.y).toBeCloseTo(1)
    mirrorNormal(45, out)
    expect(out.x).toBeCloseTo(-Math.SQRT1_2)
    expect(out.y).toBeCloseTo(Math.SQRT1_2)
  })

  it('CRTGuns: napięcia dział → uniformy', () => {
    const { handle, effect } = make('CRTGuns', GunsEffect)
    handle.apply(getter({ red: 1, green: 0.5, blue: 0 }), 1 / 60)
    expect(effect.uniforms.get('gain')!.value).toEqual(new Vector3(2, 1, 0))
    expect(effect.uniforms.get('overdrive')!.value).toEqual(new Vector3(1, 0, 0))
    expect(effect.uniforms.get('convergence')!.value).toEqual(new Vector3(0.5, 0, -0.5))
  })

  it('CRTEcho: pokrętła → uniformy echa konturów', () => {
    const { handle, effect } = make('CRTEcho', EchoEffect)
    handle.apply(getter({ echo: 1, delay: 1, spread: 0 }), 1 / 60)
    expect(effect.uniforms.get('echoGain')!.value).toBeCloseTo(0.6)
    expect((effect.uniforms.get('echoDelay')!.value as Vector3).y).toBeCloseTo(0.08)
  })

  it('CRTSignal: pokrętła → uniformy przydźwięku, jittera i chromy', () => {
    const { handle, effect } = make('CRTSignal', SignalEffect)
    handle.apply(getter({ hum: 0, jitter: 1, chroma: 1 }), 1 / 60)
    expect(effect.uniforms.get('humAmp')!.value).toBe(0)
    expect(effect.uniforms.get('jitterAmp')!.value).toBeGreaterThan(0)
    expect(effect.uniforms.get('chromaSat')!.value).toBeGreaterThan(1)
  })

  it('CRTCircuit: własne przejście, pokrętła trafiają do modelu', () => {
    const handle = createEffect('CRTCircuit')!
    expect(handle.pass).toBeInstanceOf(CrtCircuitPass)
    expect(handle.effect).toBeUndefined()
    handle.apply(getter({ hv: 0.5, hdef: 0.5, vdef: 0 }), 1 / 60)
    expect((handle.pass as CrtCircuitPass).model.out.scaleY).toBeLessThanOrEqual(0.005)
    handle.pass!.dispose()
  })

  it('CRTFlicker: Amount 0 = brak błysku, Amount 1 = pełna biała klatka przy Tone 1', () => {
    const { handle, effect } = make('CRTFlicker', FlickerEffect)
    handle.apply(getter({ amount: 0, rate: 0.5, tone: 1 }), 0)
    expect(effect.uniforms.get('flash')!.value).toBe(0)
    handle.apply(getter({ amount: 1, rate: 0, tone: 1 }), 2.01)
    expect(effect.uniforms.get('flash')!.value).toBe(1)
    expect(effect.uniforms.get('flashTone')!.value).toBe(1)
  })

  it('CRTTube: własne przejście, pokrętła → uniformy', () => {
    const handle = createEffect('CRTTube')!
    expect(handle.pass).toBeInstanceOf(CrtTubePass)
    handle.apply(getter({ glow: 1, contrast: 1, color: 0 }), 1 / 60)
    const u = (handle.pass as CrtTubePass).uniforms
    expect(u.glowGain.value).toBeCloseTo(0.8)
    expect(u.gamma.value).toBeCloseTo(1.6)
    expect(u.saturation.value).toBe(0)
    handle.pass!.dispose()
  })
})

describe('FrameClock (Posterize Time)', () => {
  const count = (fps: number, frames: number, dt: number): number => {
    const c = new FrameClock()
    let n = 0
    for (let i = 0; i < frames; i++) if (c.tick(fps, dt)) n++
    return n
  }

  it('przy 60 fps ekranu przepuszcza dokładnie tyle klatek, ile ustawiono', () => {
    expect(count(12, 600, 1 / 60)).toBe(120)
    expect(count(1, 600, 1 / 60)).toBe(10)
    expect(count(30, 600, 1 / 60)).toBe(300)
  })

  it('FPS wyższe niż ekran = każda klatka', () => {
    expect(count(30, 100, 1 / 24)).toBe(100)
  })

  it('po długiej przerwie (np. karta w tle) nie nadrabia klatek seriami', () => {
    const c = new FrameClock()
    c.tick(12, 1 / 60)
    expect(c.tick(12, 5)).toBe(true)
    expect(c.tick(12, 1 / 60)).toBe(false)
  })

  it('FPS spoza zakresu jest przycinane do 1–30', () => {
    expect(count(0, 120, 1 / 60)).toBe(2)
    expect(count(500, 60, 1 / 60)).toBe(30)
  })
})
