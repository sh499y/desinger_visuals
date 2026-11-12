import { describe, expect, it } from 'vitest'
import { getChain, sanitizeGraph } from './graph'
import { TEMPLATES } from './templates'

describe('TEMPLATES', () => {
  it('ma 4 szablony o unikalnych id', () => {
    expect(TEMPLATES).toHaveLength(4)
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(4)
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
