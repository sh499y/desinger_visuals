import { describe, expect, it } from 'vitest'
import { createEffect } from '../nodes/effects'
import { GrainEffect } from './GrainEffect'

const get =
  (v: Record<string, number>) =>
  (k: string): number =>
    v[k] ?? 0

describe('DreamerGrain', () => {
  it('Ruch 0 trzyma wzór, Ruch 1 zmienia go co klatkę', () => {
    const handle = createEffect('DreamerGrain')!
    const effect = handle.effect as GrainEffect
    expect(effect).toBeInstanceOf(GrainEffect)
    const seed = (): unknown => effect.uniforms.get('seed')!.value
    handle.apply(get({ amount: 30, motion: 0 }), 1 / 60)
    const a = seed()
    handle.apply(get({ amount: 30, motion: 0 }), 1 / 60)
    expect(seed()).toBe(a)
    handle.apply(get({ amount: 30, motion: 1 }), 1 / 60)
    const b = seed()
    handle.apply(get({ amount: 30, motion: 1 }), 1 / 60)
    expect(seed()).not.toBe(b)
    effect.dispose()
  })

  it('W cieniach / W światłach idą do shadera jako mnożniki 0..2', () => {
    const handle = createEffect('DreamerGrain')!
    const effect = handle.effect as GrainEffect
    handle.apply(get({ shadows: 200, highlights: 50 }), 1 / 60)
    expect(effect.uniforms.get('shadows')!.value).toBeCloseTo(2)
    expect(effect.uniforms.get('highlights')!.value).toBeCloseTo(0.5)
  })
})
