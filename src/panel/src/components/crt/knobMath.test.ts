import { describe, expect, it } from 'vitest'
import { NODE_DEFS, type NumberParamDef } from '@shared/nodes'
import type { AudioLevels, Graph } from '@shared/types'
import {
  CRT_TYPES,
  arcSpan,
  dragDepth,
  dragValue,
  isCrtType,
  knobAngle,
  liveValue,
  modRange
} from './knobMath'

const def = NODE_DEFS.CRTCircuit.params[0] as NumberParamDef
const audio: AudioLevels = { bass: 0.3, mid: 0, high: 0, level: 0, beat: 0 }

function graph(from: string | null): Graph {
  return {
    version: 1,
    nodes: [
      { id: 'a1', type: 'AudioIn', params: { gain: 2 } },
      { id: 'lfo1', type: 'LFO', params: { rate: 1, shape: 0 } },
      { id: 'c1', type: 'CRTCircuit', params: { hv: 0.7, hdef: 0.5, vdef: 0.5 } }
    ],
    edges: from ? [{ from, to: 'c1.hv', scale: 1, offset: 0 }] : []
  }
}

describe('knobAngle', () => {
  it('270° od −135 do 135', () => {
    expect(knobAngle(0, 0, 1)).toBe(-135)
    expect(knobAngle(0.5, 0, 1)).toBe(0)
    expect(knobAngle(1, 0, 1)).toBe(135)
  })
})

describe('dragValue', () => {
  it('200 px w górę = cały zakres, Shift = ×0,1', () => {
    expect(dragValue(0.5, -100, false, def)).toBe(1)
    expect(dragValue(0.5, -100, true, def)).toBeCloseTo(0.55)
  })
  it('przycina do zakresu i zaokrągla do kroku', () => {
    expect(dragValue(0.9, -500, false, def)).toBe(1)
    expect(dragValue(0.5, 300, false, def)).toBe(0)
    const v = dragValue(0.5, -13, false, def)
    expect(Math.abs(v / 0.005 - Math.round(v / 0.005))).toBeLessThan(1e-9)
  })
})

describe('liveValue', () => {
  it('bez kabla → null', () => {
    expect(liveValue(graph(null), 'c1', 'hv', audio)).toBeNull()
  })
  it('kabel z Audio → poziom × wzmocnienie przez applyEdge', () => {
    expect(liveValue(graph('a1.bass'), 'c1', 'hv', audio)).toBeCloseTo(0.6)
  })
  it('kabel z innego źródła → wartość ustawiona w node', () => {
    expect(liveValue(graph('lfo1.value'), 'c1', 'hv', audio)).toBe(0.7)
  })
})

describe('isCrtType', () => {
  it('4 node’y CRT, każdy z 3 pokrętłami', () => {
    for (const t of CRT_TYPES) {
      expect(isCrtType(t)).toBe(true)
      expect(NODE_DEFS[t].params).toHaveLength(3)
    }
    expect(isCrtType('Bloom')).toBe(false)
  })
})

describe('modulacja na pokrętle', () => {
  it('modRange: baza = offset, głębokość = skala, zakres przycięty do parametru', () => {
    expect(modRange({ from: 'a1.bass', to: 'c1.hv', scale: 0.35, offset: 0.4 }, def)).toEqual({
      base: 0.4,
      depth: 0.35,
      lo: 0.4,
      hi: 0.75
    })
    const neg = modRange({ from: 'a1.bass', to: 'c1.hv', scale: -0.8, offset: 0.5 }, def)
    expect(neg.lo).toBe(0)
    expect(neg.hi).toBe(0.5)
    expect(modRange({ from: 'a1.bass', to: 'c1.hv' }, def)).toMatchObject({ base: 0, depth: 1 })
  })

  it('arcSpan: łuk od mniejszego do większego kąta', () => {
    expect(arcSpan(0.5, 0.25, def)).toEqual({ start: 0, sweep: 67.5 })
    expect(arcSpan(0.5, -0.5, def)).toEqual({ start: -135, sweep: 135 })
  })

  it('dragDepth: 200 px = cały zakres, przycięte do ±zakresu i zaokrąglone do kroku', () => {
    expect(dragDepth(0, -100, false, def)).toBe(0.5)
    expect(dragDepth(0.5, 1000, false, def)).toBe(-1)
    expect(dragDepth(0.9, -1000, false, def)).toBe(1)
    expect(dragDepth(0.2, -13, true, def)).toBeCloseTo(0.205)
  })
})
