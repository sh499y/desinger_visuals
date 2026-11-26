import { describe, expect, it } from 'vitest'
import { createEffect } from '../nodes/effects'
import { DreamerBlurPass } from './DreamerBlurPass'

const get =
  (v: Record<string, number>) =>
  (k: string): number =>
    v[k] ?? 0

describe('DreamerBlur', () => {
  it('przekazuje parametry do przejścia, Siła 0 = nieaktywne', () => {
    const handle = createEffect('DreamerBlur')!
    const pass = handle.pass as DreamerBlurPass
    expect(pass).toBeInstanceOf(DreamerBlurPass)
    handle.apply(get({ kind: 2, amount: 0 }), 1 / 60)
    expect(pass.active).toBe(false)
    handle.apply(get({ kind: 2, amount: 50, angle: 30, centerX: 0.2, focus: 0.4 }), 1 / 60)
    expect(pass.active).toBe(true)
    expect(pass.kind).toBe(2)
    expect(pass.params).toMatchObject({ amount: 50, angle: 30, centerX: 0.2, focus: 0.4 })
    pass.dispose()
  })
})
