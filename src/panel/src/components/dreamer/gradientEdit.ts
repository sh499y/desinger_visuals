// Edycja stopów gradientu w panelu: czyste funkcje, każda zwraca nową listę (posortowaną).

import { MAX_STOPS, sampleGradient, type GradientStop } from '@shared/gradient'

const sorted = (s: GradientStop[]): GradientStop[] => [...s].sort((a, b) => a.pos - b.pos)
const clamp01 = (v: number): number => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))
const hex = (v: number): string =>
  Math.round(clamp01(v) * 255)
    .toString(16)
    .padStart(2, '0')

/** Nowy stop w `pos` w kolorze, jaki gradient ma w tym miejscu. */
export function addStop(stops: GradientStop[], pos: number): GradientStop[] {
  if (stops.length >= MAX_STOPS) return stops
  const rgb = [0, 0, 0]
  const p = Number(clamp01(pos).toFixed(3))
  sampleGradient(stops, p, rgb)
  return sorted([...stops, { pos: p, color: `#${rgb.map(hex).join('')}`, hard: false }])
}

export function moveStop(stops: GradientStop[], i: number, pos: number): GradientStop[] {
  if (!stops[i]) return stops
  return sorted(stops.map((s, k) => (k === i ? { ...s, pos: Number(clamp01(pos).toFixed(3)) } : s)))
}

/** Usuwa stop, ale zostawia co najmniej dwa. */
export function removeStop(stops: GradientStop[], i: number): GradientStop[] {
  if (stops.length <= 2 || !stops[i]) return stops
  return stops.filter((_, k) => k !== i)
}

export function setColor(stops: GradientStop[], i: number, color: string): GradientStop[] {
  if (!stops[i] || !/^#[0-9a-f]{6}$/i.test(color)) return stops
  return stops.map((s, k) => (k === i ? { ...s, color: color.toLowerCase() } : s))
}

export function toggleHard(stops: GradientStop[], i: number): GradientStop[] {
  if (!stops[i]) return stops
  return stops.map((s, k) => (k === i ? { ...s, hard: !s.hard } : s))
}

/** Tło CSS paska: twardy stop trzyma kolor do następnego stopu. */
export function cssGradient(stops: GradientStop[]): string {
  const s = sorted(stops)
  const pct = (p: number): string => `${Math.round(p * 1000) / 10}%`
  const parts: string[] = []
  s.forEach((stop, i) => {
    parts.push(`${stop.color} ${pct(stop.pos)}`)
    const next = s[i + 1]
    if (stop.hard && next) parts.push(`${stop.color} ${pct(next.pos)}`)
  })
  if (parts.length === 1) parts.push(parts[0])
  return `linear-gradient(90deg, ${parts.join(', ')})`
}
