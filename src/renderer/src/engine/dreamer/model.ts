// Model Dreamera: wartości z parametrów node'ów przeliczone na to, co czytają shadery.
// Stałe i wzory przeniesione z LightCrafta (`crates/pipeline/src/dreamer.rs`).
// Rozmiary są ułamkami dłuższego boku klatki, więc każda rozdzielczość wygląda tak samo.

export const BLUR_KINDS = ['Gaussian', 'Motion', 'Spin', 'Zoom', 'Band', 'Ellipse'] as const
export const GRAIN_KINDS = [
  'Crystal',
  'Clumps',
  'Raw',
  'Fine',
  'Sand',
  'Clouds',
  'Cells',
  'Streaks',
  'Silver',
  'Halftone',
  'Dither'
] as const

/** Gaussian przy Sile 100: σ jako ułamek dłuższego boku. */
export const GAUSS_MAX = 0.03
/** Motion przy Sile 100: długość smugi. */
export const MOTION_MAX = 0.15
/** Spin przy Sile 100: łuk w radianach. */
export const SPIN_MAX = 0.6
/** Zoom przy Sile 100: jak daleko w stronę środka sięga ścieżka (ułamek odległości). */
export const ZOOM_MAX = 0.4
/** Najwięcej próbek na ścieżce. */
export const TAPS = 24
/** Ziarno przy Sile 100: rozrzut jasności (w kodowaniu ekranowym). */
export const GRAIN_MAX = 0.2
/** Komórka ziarna przy Rozmiarze 0; Rozmiar 100 to dziesięć razy więcej. */
export const CELL_MIN = 1 / 6000
/** Miękkość przy 100: σ rozmycia pola ziarna. */
export const SOFT_MAX = 0.0012

const DEG = Math.PI / 180
const unit = (v: number, full: number): number =>
  Number.isFinite(v) ? Math.min(1, Math.max(0, v / full)) : 0

/** Obszar ostry Band / Ellipse w pikselach, jak `focus_geom` w LightCrafcie. */
export interface FocusGeom {
  cx: number
  cy: number
  /** Kierunek w radianach, przeciwnie do wskazówek zegara od osi x (y w dół). */
  angle: number
  bandHalf: number
  bandOuter: number
  rx: number
  ry: number
  outer: number
}

export interface DreamerBlurParams {
  amount: number
  angle: number
  centerX: number
  centerY: number
  focus: number
  feather: number
}

export function focusGeom(p: DreamerBlurParams, w: number, h: number, out: FocusGeom): FocusGeom {
  const long = Math.max(w, h)
  const half = unit(p.focus, 1) * 0.5
  const feather = unit(p.feather, 1)
  out.cx = unit(p.centerX, 1) * w
  out.cy = unit(p.centerY, 1) * h
  out.angle = (Number.isFinite(p.angle) ? p.angle : 0) * DEG
  out.bandHalf = half * long
  out.bandOuter = (half + feather * 0.5 + 0.005) * long
  out.rx = Math.max(half * w, 1)
  out.ry = Math.max(half * h, 1)
  out.outer = 1 + feather * 1.5 + 0.02
  return out
}

/** Poziom piramidy (mipa), na którym gaussian σ pikseli ma mały kernel. */
export function gaussLevel(sigmaPx: number): number {
  return Math.floor(Math.log2(Math.max(sigmaPx / 3, 1)))
}

export interface BlurUniforms {
  /** Indeks w `BLUR_KINDS`. */
  kind: number
  /** σ gaussiana w pikselach pełnej klatki (Gaussian, Band, Ellipse). */
  sigma: number
  /** Motion: długość smugi w pikselach i kierunek. */
  len: number
  dirX: number
  dirY: number
  /** Spin: łuk w radianach. */
  theta: number
  /** Zoom: zasięg 0..ZOOM_MAX. */
  reach: number
  geom: FocusGeom
}

export const emptyBlur = (): BlurUniforms => ({
  kind: 0,
  sigma: 0,
  len: 0,
  dirX: 1,
  dirY: 0,
  theta: 0,
  reach: 0,
  geom: { cx: 0, cy: 0, angle: 0, bandHalf: 0, bandOuter: 0, rx: 1, ry: 1, outer: 1 }
})

/** Wypełnia `out` dla klatki `w × h` (bez alokacji). */
export function blurUniforms(
  kind: number,
  p: DreamerBlurParams,
  w: number,
  h: number,
  out: BlurUniforms
): void {
  const long = Math.max(w, h)
  const amount = unit(p.amount, 100)
  out.kind = Math.min(BLUR_KINDS.length - 1, Math.max(0, Math.round(kind) || 0))
  out.sigma = amount * GAUSS_MAX * long
  out.len = amount * MOTION_MAX * long
  const a = (Number.isFinite(p.angle) ? p.angle : 0) * DEG
  out.dirX = Math.cos(a)
  out.dirY = -Math.sin(a)
  out.theta = amount * SPIN_MAX
  out.reach = amount * ZOOM_MAX
  focusGeom(p, w, h, out.geom)
}

/** Waga ziarna w tonie `l` (0..1); W cieniach / W światłach 0..200, 100 = bez zmian. */
export function toneWeight(l: number, shadows: number, highlights: number): number {
  const s = unit(shadows, 200) * 2
  const hl = unit(highlights, 200) * 2
  return l < 0.5 ? s + (1 - s) * l * 2 : 1 + (hl - 1) * (l - 0.5) * 2
}

/** Komórka ziarna w pikselach przy Rozmiarze 0..100. */
export function grainCell(size: number, long: number): number {
  return CELL_MIN * Math.pow(10, unit(size, 100)) * long
}

/**
 * Kiedy ziarno losuje nowy wzór. Ruch 0 = wzór stoi, 1 = nowy w każdej klatce;
 * pomiędzy odstęp maleje wykładniczo od 2 s.
 */
export class GrainClock {
  private seed = 0
  private acc = 0

  tick(dt: number, motion: number): number {
    if (!(motion > 0)) return this.seed
    // Pełny ruch: nowy wzór w każdej klatce, niezależnie od odświeżania (60 / 120 Hz).
    if (motion >= 1) return (this.seed = (this.seed + 1) % 65536)
    const interval = 2 * Math.pow(1 / 120, Math.min(1, motion))
    this.acc += Math.max(0, dt)
    if (this.acc + 1e-9 >= interval) {
      this.acc = this.acc % interval
      this.seed = (this.seed + 1) % 65536
    }
    return this.seed
  }
}
