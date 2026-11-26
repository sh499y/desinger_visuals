// Kolory xterm (ANSI) dla audio i sygnałów. Reszta UI jest 1-bit.
// Wartości to zmienne CSS z `index.css` (@theme), więc działają w `style` i w SVG.

import { splitPort } from '@shared/graph'
import type { NodeCategory, NodeType } from '@shared/nodes'
import type { Graph } from '@shared/types'

/** Kolor logiczny sygnału (pasmo audio albo niebieski dla LFO/Math). */
export type TermColor = 'white' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan'

/** Nazwy zmiennych CSS `--color-term-*`, w tym jasne warianty xterm (90–97). */
type TermToken = TermColor | 'bright-white' | 'bright-red' | 'bright-magenta' | 'bright-blue'

export const termVar = (c: TermToken): string => `var(--color-term-${c})`

/** Pasma wyjść node'a AudioIn. */
export const BAND_COLORS: Readonly<Record<string, TermColor>> = {
  bass: 'red',
  mid: 'yellow',
  high: 'cyan',
  level: 'white',
  beat: 'magenta'
}

/** Kolor wyjścia sygnału `port` node'a typu `type`: pasmo audio, zielony dla MPC, inaczej niebieski. */
export function portColor(type: NodeType | undefined, port: string): TermColor {
  if (type === 'AudioIn') return BAND_COLORS[port] ?? 'white'
  if (type === 'MPC') return 'green'
  return 'blue'
}

/** Kolor sygnału z wyjścia `ref` (`node.port`). */
export function signalColor(graph: Graph, ref: string): TermColor {
  const { node, port } = splitPort(ref)
  return portColor(graph.nodes.find((n) => n.id === node)?.type, port)
}

/**
 * Kolor do tekstu 12–13px (AA ≥ 4.5:1 na czerni): red i magenta w jasnych wariantach xterm,
 * niebieski (nawet jasny) zamieniony na biel.
 */
export function textVar(c: TermColor): string {
  if (c === 'blue') return termVar('white')
  if (c === 'red') return termVar('bright-red')
  if (c === 'magenta') return termVar('bright-magenta')
  return termVar(c)
}

/** Kolor do linii i uchwytów: niebieski xterm (2.2:1) zamieniony na jasny niebieski (94). */
export const lineVar = (c: TermColor): string => termVar(c === 'blue' ? 'bright-blue' : c)

/** Skróty kategorii node'ów w tagach: `[SRC] [FX] [CTL] [OUT]`. */
export const CATEGORY_TAG: Readonly<Record<NodeCategory, string>> = {
  source: 'src',
  filter: 'fx',
  control: 'ctl',
  output: 'out'
}
