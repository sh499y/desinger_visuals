// Model fizyczny kineskopu CRT: z 6 „napięć” liczy wartości dla shaderów.
// Tu jest wszystko, co zależy od czasu (fazy synchronizacji, iskrzenie),
// shadery tylko rysują. Czysty TS: bez WebGL, bez alokacji w step().
// Opis wzorów: docs/superpowers/specs/2026-11-13-crt-nodes-design.md

/** Zakres złapania synchronizacji wokół 0,5 (H i V). */
export const LOCK_RANGE = 0.25

export interface GunUniforms {
  /** Wzmocnienie sygnału działa (1 = znamionowe). */
  gain: number
  /** Odchylenie zbieżności, −0,5…0,5. */
  convergence: number
  /** Przesterowanie wzmacniacza, 0…1. */
  overdrive: number
}

const unit = (v: number): number => (v > 1 ? 1 : v > 0 ? v : 0)

export function gunUniforms(
  v: number,
  out: GunUniforms = { gain: 0, convergence: 0, overdrive: 0 }
): GunUniforms {
  const k = unit(v)
  out.gain = 2 * k
  out.convergence = k - 0.5
  out.overdrive = Math.max(0, 2 * k - 1)
  return out
}

export interface CircuitKnobs {
  hv: number
  hdef: number
  vdef: number
}

export interface CircuitUniforms {
  /** Wielkość obrazu (1 = pełny ekran), już z 1/√hvRatio, bez spadku pod obciążeniem. */
  scaleX: number
  scaleY: number
  linH: number
  linV: number
  pincushion: number
  /** HV(k) / HV znamionowe. */
  hvRatio: number
  brightness: number
  focus: number
  /** Drżenie linii w zakresie synchronizacji (ułamek szerokości). */
  jitter: number
  /** Rozstrojenie poziome: przesunięcie fazy na linię; 0 = synchronizacja. */
  hDetune: number
  hPhase: number
  /** 1 = pion poza synchronizacją (obraz się toczy). */
  vRolling: number
  vPhase: number
  /** Błysk iskry, 0…1. */
  arc: number
}

const ARC_THRESHOLD = 0.85
const ARC_RATE = 20 // błysków/s na jednostkę ponad progiem
const ARC_DECAY = 0.1 // s
const COLLAPSE = 0.1

const frac = (v: number): number => v - Math.floor(v)
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const smoothstep = (a: number, b: number, v: number): number => {
  const t = unit((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
/** Odchylenie poza zakres synchronizacji (0 = złapana), ze znakiem. */
const detune = (k: number): number => {
  const d = Math.abs(k - 0.5) - LOCK_RANGE
  return d > 0 ? Math.sign(k - 0.5) * d : 0
}

export class CircuitModel {
  readonly out: CircuitUniforms = {
    scaleX: 1,
    scaleY: 1,
    linH: 0,
    linV: 0,
    pincushion: 0,
    hvRatio: 1,
    brightness: 1,
    focus: 1,
    jitter: 0,
    hDetune: 0,
    hPhase: 0,
    vRolling: 0,
    vPhase: 0,
    arc: 0
  }

  step(knobs: CircuitKnobs, dt: number, random: () => number): CircuitUniforms {
    const o = this.out
    const hv = unit(knobs.hv)
    const h = unit(knobs.hdef)
    const v = unit(knobs.vdef)

    o.hvRatio = 0.5 + hv
    o.focus = o.hvRatio
    o.brightness = o.hvRatio * smoothstep(0.02, 0.15, hv)
    const size = 1 / Math.sqrt(o.hvRatio)

    o.scaleX = (0.5 + h) * size
    o.scaleY = (v < COLLAPSE ? lerp(0.003, 0.6, v / COLLAPSE) : 0.5 + v) * size
    o.linH = 0.3 * (h - 0.5)
    o.linV = 0.3 * (v - 0.5)
    o.pincushion = 0.2 * Math.abs(h - 0.5)

    const dh = detune(h)
    o.hDetune = dh * 0.08
    o.jitter = dh === 0 ? 0.004 * Math.abs(h - 0.5) : 0
    o.hPhase = frac(o.hPhase + dt * o.hDetune * 10)

    const dv = detune(v)
    o.vRolling = dv === 0 ? 0 : 1
    o.vPhase = dv === 0 ? 0 : frac(o.vPhase + dt * dv * 4)

    if (hv > ARC_THRESHOLD && random() < ARC_RATE * (hv - ARC_THRESHOLD) * dt) o.arc = 1
    else o.arc = Math.max(0, o.arc - dt / ARC_DECAY)

    return o
  }
}

export interface EchoKnobs {
  echo: number
  delay: number
  spread: number
}

export interface EchoUniforms {
  /** Siła pierwszego obrysu (kolejne mają naprzemienny znak i zanikają). */
  echoGain: number
  /** Opóźnienie odbicia na kanał, ułamek szerokości ekranu. */
  delayR: number
  delayG: number
  delayB: number
  /** Dodatkowe rozsunięcie zbieżności przez Spread (R w prawo, B w lewo). */
  spreadShift: number
}

const ECHO_MAX = 0.6
const DELAY_MIN = 0.005
const DELAY_MAX = 0.08
const SPREAD_DELAY = 0.6
const SPREAD_SHIFT = 0.004

/** CRT Echo: odbicia sygnału w kablu – obrysy krawędzi, osobno na kanał. */
export function echoUniforms(
  k: EchoKnobs,
  out: EchoUniforms = { echoGain: 0, delayR: 0, delayG: 0, delayB: 0, spreadShift: 0 }
): EchoUniforms {
  const spread = unit(k.spread)
  const d = lerp(DELAY_MIN, DELAY_MAX, unit(k.delay))
  out.echoGain = ECHO_MAX * unit(k.echo)
  out.delayR = d * (1 + SPREAD_DELAY * spread)
  out.delayG = d
  out.delayB = d * (1 - SPREAD_DELAY * spread)
  out.spreadShift = SPREAD_SHIFT * spread
  return out
}

export interface SignalKnobs {
  hum: number
  jitter: number
  chroma: number
}

export interface SignalUniforms {
  /** Falowanie linii w poziomie (ułamek szerokości). */
  humAmp: number
  /** Głębokość ciemnego pasa przydźwięku, 0…1. */
  humBar: number
  /** Faza pasa i fal, [0,1). */
  humPhase: number
  /** Szarpanie linii: przesunięcie w poziomie (ułamek szerokości). */
  jitterAmp: number
  /** Czas szumu jittera [s], zawinięty do [0, 1000). */
  jitterTime: number
  /** Promień rozlewania chrominancji (ułamek szerokości). */
  chromaBleed: number
  /** Mnożnik nasycenia (1 = bez zmian). */
  chromaSat: number
  /** Przesunięcie barwy [rad]. */
  chromaHue: number
}

const HUM_AMP = 0.01
const HUM_BAR = 0.35
const HUM_SPEED = 0.3 // przewijanie pasa [ekran/s] – dudnienie 50 Hz z częstotliwością pola
const JITTER_AMP = 0.006
const JITTER_WRAP = 1000
const CHROMA_BLEED = 0.02
const CHROMA_SAT = 1.5
const CHROMA_HUE = 0.6

/** CRT Signal: tor sygnału kompozytowego – przydźwięk, błąd podstawy czasu, chrominancja. */
export class SignalModel {
  readonly out: SignalUniforms = {
    humAmp: 0,
    humBar: 0,
    humPhase: 0,
    jitterAmp: 0,
    jitterTime: 0,
    chromaBleed: 0,
    chromaSat: 1,
    chromaHue: 0
  }

  step(k: SignalKnobs, dt: number): SignalUniforms {
    const o = this.out
    const hum = unit(k.hum)
    const chroma = unit(k.chroma)
    o.humAmp = HUM_AMP * hum
    o.humBar = HUM_BAR * hum
    o.humPhase = frac(o.humPhase + dt * HUM_SPEED)
    o.jitterAmp = JITTER_AMP * unit(k.jitter)
    o.jitterTime = (o.jitterTime + dt) % JITTER_WRAP
    o.chromaBleed = CHROMA_BLEED * chroma
    o.chromaSat = 1 + CHROMA_SAT * chroma
    o.chromaHue = CHROMA_HUE * chroma
    return o
  }
}

export interface TubeKnobs {
  glow: number
  contrast: number
  color: number
}

export interface TubeUniforms {
  /** Siła halacji (światło rozproszone w szkle bańki). */
  glowGain: number
  /** Wykładnik krzywej kineskopu w świetle liniowym (>1 = głębsza czerń). */
  gamma: number
  /** Nasycenie luminoforów (0 = czarno-biały, 1 = jak wejście). */
  saturation: number
}

const GLOW_MAX = 0.8
const GAMMA_MIN = 0.8
const GAMMA_MAX = 1.6

/** CRT Tube: szkło i luminofory – halacja, krzywa kineskopu, nasycenie. */
export function tubeUniforms(
  k: TubeKnobs,
  out: TubeUniforms = { glowGain: 0, gamma: 1, saturation: 1 }
): TubeUniforms {
  const c = unit(k.color)
  out.glowGain = GLOW_MAX * unit(k.glow)
  out.gamma = lerp(GAMMA_MIN, GAMMA_MAX, unit(k.contrast))
  // 0→0 (czarno-biały), 0,5→1,25, 1→2: ciągle, w dolnej połowie szybciej do szarości.
  out.saturation = c <= 0.5 ? 2.5 * c : 1.25 + 1.5 * (c - 0.5)
  return out
}

export interface FlickerKnobs {
  amount: number
  rate: number
  tone: number
}

export interface FlickerUniforms {
  /** Udział klatki błysku: 0 = obraz, 1 = pełna czarna/biała klatka. */
  mix: number
  /** Kolor bieżącego błysku: 0 = czarny, 1 = biały. */
  tone: number
  /** Liczba błysków na sekundę. */
  freq: number
}

const FLICKER_F_MIN = 0.5
const FLICKER_F_RATIO = 40 // 0,5 Hz · 40 = 20 Hz
/** Najdłuższy błysk [s]; przy szybkim tempie najwyżej pół cyklu. */
const FLASH_MAX = 0.06

/**
 * CRT Flicker: stroboskop. Co cykl krótki błysk pełnej czarnej albo białej
 * klatki (Tone = szansa, że błysk jest biały). Błysk trafia zawsze w co
 * najmniej jedną klatkę, nawet gdy cykl jest krótszy niż klatka.
 */
export class FlickerModel {
  readonly out: FlickerUniforms = { mix: 0, tone: 0, freq: FLICKER_F_MIN }
  private phase = 0
  private cycle = -1
  private flashLeft = 0

  step(k: FlickerKnobs, dt: number, random: () => number): FlickerUniforms {
    const o = this.out
    const step = Math.max(dt, 0)
    o.freq = FLICKER_F_MIN * Math.pow(FLICKER_F_RATIO, unit(k.rate))
    this.phase += o.freq * step
    const cycle = Math.floor(this.phase)
    if (cycle !== this.cycle) {
      this.cycle = cycle
      this.flashLeft = Math.max(Math.min(0.5 / o.freq, FLASH_MAX), Number.MIN_VALUE)
      o.tone = random() < unit(k.tone) ? 1 : 0
    }
    if (this.phase > 1e6) {
      this.phase -= cycle // bez utraty precyzji w długich setach
      this.cycle = 0
    }
    o.mix = this.flashLeft > 0 ? unit(k.amount) : 0
    this.flashLeft -= step
    return o
  }
}
