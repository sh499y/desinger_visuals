// Gradient mapy kolorów (Dreamer Gradient): stopy zapisane jako tekst w parametrze node'a.
// Format: stopy rozdzielone `;`, każdy `pos:rrggbb`, z `:h` dla twardego stopu
// (kolor stoi do następnego stopu, bez przejścia). Np. `0:0e1428;0.35:3d4d75;1:ecd6a8`.
// Próbkowanie jak `gradient_at` w LightCrafcie; presety jak `builtin_gradients()`.

export interface GradientStop {
  /** 0..1 */
  pos: number
  /** `#rrggbb` (małe litery) */
  color: string
  /** Twardy: kolor stoi aż do następnego stopu. */
  hard: boolean
}

export const MAX_STOPS = 16
export const GRADIENT_MAX_LEN = 400

const STOP_RE = /^(\d+(?:\.\d+)?):([0-9a-fA-F]{6})(:h)?$/

export function parseGradient(s: string): GradientStop[] | null {
  if (typeof s !== 'string' || s.length === 0 || s.length > GRADIENT_MAX_LEN) return null
  const parts = s.split(';')
  if (parts.length > MAX_STOPS) return null
  const stops: GradientStop[] = []
  for (const part of parts) {
    const m = STOP_RE.exec(part)
    if (!m) return null
    const pos = Number(m[1])
    if (!Number.isFinite(pos) || pos < 0 || pos > 1) return null
    stops.push({ pos, color: `#${m[2].toLowerCase()}`, hard: m[3] !== undefined })
  }
  return stops.sort((a, b) => a.pos - b.pos)
}

const fmtPos = (p: number): string => String(Number(Math.min(1, Math.max(0, p)).toFixed(3)))

export function encodeGradient(stops: GradientStop[]): string {
  return [...stops]
    .sort((a, b) => a.pos - b.pos)
    .map((s) => `${fmtPos(s.pos)}:${s.color.slice(1).toLowerCase()}${s.hard ? ':h' : ''}`)
    .join(';')
}

const channel = (color: string, i: number): number =>
  parseInt(color.slice(1 + 2 * i, 3 + 2 * i), 16) / 255

/** Kolor sRGB 0..1 w punkcie `t`, zapisany do `out[offset..offset+3]`. Stopy posortowane. */
export function sampleGradient(
  stops: GradientStop[],
  t: number,
  out: Float32Array | number[],
  offset = 0
): void {
  const write = (c: string): void => {
    for (let i = 0; i < 3; i++) out[offset + i] = channel(c, i)
  }
  if (stops.length === 0) {
    out[offset] = out[offset + 1] = out[offset + 2] = 0
    return
  }
  const x = Number.isFinite(t) ? t : 0
  if (x <= stops[0].pos) return write(stops[0].color)
  for (let k = 0; k + 1 < stops.length; k++) {
    const a = stops[k]
    const b = stops[k + 1]
    if (x < b.pos) {
      if (a.hard || b.pos - a.pos <= 1e-6) return write(a.color)
      const f = (x - a.pos) / (b.pos - a.pos)
      for (let i = 0; i < 3; i++) {
        const ca = channel(a.color, i)
        out[offset + i] = ca + (channel(b.color, i) - ca) * f
      }
      return
    }
  }
  write(stops[stops.length - 1].color)
}

const preset = (
  name: string,
  stops: [number, string, boolean?][]
): { name: string; value: string } => ({
  name,
  value: encodeGradient(stops.map(([pos, color, hard]) => ({ pos, color, hard: hard === true })))
})
const even = (name: string, colors: string[]): { name: string; value: string } =>
  preset(
    name,
    colors.map((c, i) => [i / Math.max(1, colors.length - 1), c])
  )

/** Wbudowane presety, w tej samej kolejności co w LightCrafcie. */
export const GRADIENT_PRESETS: readonly { name: string; value: string }[] = [
  preset('Navy & Ochre', [
    [0, '#0e1428'],
    [0.35, '#3d4d75'],
    [0.55, '#b7956a'],
    [1, '#ecd6a8']
  ]),
  preset('Heat', [
    [0, '#000000'],
    [0.2, '#3a0f5a'],
    [0.45, '#c0203a'],
    [0.7, '#f07a20'],
    [1, '#f6e05a']
  ]),
  preset('Violet', [
    [0, '#1a0b3a'],
    [0.4, '#6a3ac0'],
    [0.7, '#c070c8'],
    [1, '#f4d0f0']
  ]),
  preset('Green & Orange', [
    [0, '#0f3a2c'],
    [0.45, '#2f6a4a'],
    [0.6, '#e05a2a'],
    [1, '#f6b080']
  ]),
  preset('Contour', [
    [0, '#d4c86a'],
    [0.12, '#000000'],
    [0.2, '#1f6f80', true],
    [0.45, '#d4c86a'],
    [1, '#d4c86a']
  ]),
  preset('Duotone', [
    [0, '#101830', true],
    [0.5, '#e0c090'],
    [1, '#e0c090']
  ]),
  even('Sepia', ['#1a1008', '#6b4a2a', '#c8a070', '#f4e6cc']),
  even('Cyanotype', ['#0a1a3a', '#1f4f8a', '#8ab4d8', '#eef4f8']),
  even('Sunset', ['#1a0a2a', '#7a1f4a', '#e0603a', '#f6c860']),
  even('Mono', ['#000000', '#ffffff'])
]

/** Wartość presetu po nazwie; nieznana nazwa → Mono. */
export function presetValue(name: string): string {
  return (GRADIENT_PRESETS.find((p) => p.name === name) ?? GRADIENT_PRESETS[9]).value
}
