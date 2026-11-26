// Typy node'ów rysowanych jako Dreamer i preset gradientu na listwie każdego z nich.

export const DREAMER_TYPES = ['DreamerBlur', 'DreamerGrain', 'DreamerGradient', 'Smooth'] as const
export type DreamerType = (typeof DREAMER_TYPES)[number]
export const isDreamerType = (t: string): t is DreamerType =>
  (DREAMER_TYPES as readonly string[]).includes(t)

/** Preset gradientu na listwie każdego noda. */
export const NODE_GRADIENT: Record<DreamerType, string> = {
  DreamerBlur: 'Violet',
  DreamerGrain: 'Sunset',
  DreamerGradient: 'Heat',
  Smooth: 'Cyanotype'
}
