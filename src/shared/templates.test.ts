import { describe, expect, it } from 'vitest'
import { getChain, sanitizeGraph } from './graph'
import { TEMPLATES } from './templates'

describe('TEMPLATES', () => {
  it('ma 5 szablonów o unikalnych id', () => {
    expect(TEMPLATES).toHaveLength(5)
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(5)
  })

  it('strobe-pattern: pełne błyski, tempo z LFO (prostokąt), nie z beatu', () => {
    const g = TEMPLATES.find((t) => t.id === 'strobe-pattern')!.graph
    const flicker = g.nodes.find((n) => n.type === 'CRTFlicker')!
    expect(flicker.params.amount).toBe(1)
    const rate = g.edges.find((e) => e.to === `${flicker.id}.rate`)!
    const lfo = g.nodes.find((n) => `${n.id}.value` === rate.from)!
    expect(lfo.type).toBe('LFO')
    expect(lfo.params.shape).toBe(3)
    expect(g.edges.some((e) => e.from.endsWith('.beat'))).toBe(false)
  })

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s: graf jest poprawny', (_id, t) => {
    // sanitizeGraph nie może zgubić node'ów ani kabli
    expect(sanitizeGraph(t.graph)).toEqual(t.graph)
    const chain = getChain(t.graph)
    expect(chain.source?.type).toBe('VideoFile')
    expect(chain.output?.type).toBe('Output')
    expect(chain.filters.length).toBeGreaterThan(1)
    // wszystkie kable łączą istniejące porty (connect odrzuca błędne po cichu)
    const sent = t.graph.edges.length
    expect(sent).toBeGreaterThan(chain.filters.length)
  })
})
