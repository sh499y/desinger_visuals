import { describe, expect, it } from 'vitest'
import { presetValue } from '@shared/gradient'
import { createEffect } from '../nodes/effects'
import { GradientLut, GradientMapEffect } from './GradientMapEffect'

describe('GradientLut', () => {
  it('przelicza mapę tylko przy zmianie tekstu', () => {
    const lut = new GradientLut()
    const v0 = lut.texture.version
    expect(lut.set(presetValue('Heat'))).toBe(true)
    const v1 = lut.texture.version
    expect(v1).toBeGreaterThan(v0)
    expect(lut.set(presetValue('Heat'))).toBe(false)
    expect(lut.texture.version).toBe(v1)
  })

  it('zły tekst zostawia poprzednią mapę', () => {
    const lut = new GradientLut()
    lut.set(presetValue('Mono'))
    const before = Array.from(lut.texture.image.data as Uint8Array)
    expect(lut.set('zzz')).toBe(false)
    expect(Array.from(lut.texture.image.data as Uint8Array)).toEqual(before)
  })
})

describe('DreamerGradient', () => {
  it('bierze gradienty z parametrów tekstowych, a bez nich domyślne', () => {
    const handle = createEffect('DreamerGradient')!
    const effect = handle.effect as GradientMapEffect
    expect(effect).toBeInstanceOf(GradientMapEffect)
    const set: string[] = []
    effect.a.set = (v: string): boolean => (set.push(`a:${v}`), true)
    effect.b.set = (v: string): boolean => (set.push(`b:${v}`), true)
    handle.apply(
      () => 0,
      1 / 60,
      (k) => (k === 'a' ? presetValue('Sepia') : undefined)
    )
    expect(set).toEqual([`a:${presetValue('Sepia')}`, `b:${presetValue('Violet')}`])
  })
})
