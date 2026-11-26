// Dreamer Ziarno jako efekt postprocessing. Pole szumu liczy shader (grain.frag);
// tu tylko przeliczenie parametrów na piksele bieżącej klatki i zegar wzoru.

import { Effect } from 'postprocessing'
import { Uniform } from 'three'
import fragment from './grain.frag?raw'
import { GRAIN_KINDS, GrainClock, SOFT_MAX, grainCell } from './model'

export interface GrainParams {
  kind: number
  amount: number
  size: number
  softness: number
  shadows: number
  highlights: number
  motion: number
}

const unit = (v: number, full: number): number =>
  Number.isFinite(v) ? Math.min(1, Math.max(0, v / full)) : 0

export class GrainEffect extends Effect {
  private readonly clock = new GrainClock()
  private width = 1
  private height = 1

  constructor() {
    super('DreamerGrain', fragment, {
      uniforms: new Map<string, Uniform>([
        ['kind', new Uniform(0)],
        ['amount', new Uniform(0)],
        ['cell', new Uniform(1)],
        ['soft', new Uniform(0)],
        ['edge', new Uniform(0.001)],
        ['shadows', new Uniform(1)],
        ['highlights', new Uniform(1)],
        ['seed', new Uniform(0)]
      ])
    })
  }

  setParams(p: GrainParams, dt: number): void {
    const long = Math.max(this.width, this.height)
    const u = this.uniforms
    u.get('kind')!.value = Math.min(GRAIN_KINDS.length - 1, Math.max(0, Math.round(p.kind) || 0))
    u.get('amount')!.value = unit(p.amount, 100)
    u.get('cell')!.value = grainCell(p.size, long)
    u.get('soft')!.value = unit(p.softness, 100) * SOFT_MAX * long
    u.get('edge')!.value = unit(p.softness, 100) * 0.5 + 1e-3
    u.get('shadows')!.value = unit(p.shadows, 200) * 2
    u.get('highlights')!.value = unit(p.highlights, 200) * 2
    u.get('seed')!.value = this.clock.tick(dt, p.motion) * 1013
  }

  override setSize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
  }
}
