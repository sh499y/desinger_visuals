// Definicje node'ów: porty i parametry. Czyste dane, używane przez panel (UI)
// i silnik (rendering). Efekty dla node'ów są w src/renderer/src/engine/nodes/.

export type NodeType =
  | 'VideoFile'
  | 'BrightnessContrast'
  | 'HueSaturation'
  | 'Bloom'
  | 'RGBSplit'
  | 'Pixelate'
  | 'Glitch'
  | 'Noise'
  | 'Vignette'
  | 'AudioIn'
  | 'LFO'
  | 'Math'
  | 'Output'

export type NodeCategory = 'source' | 'filter' | 'control' | 'output'

interface BaseParam {
  key: string
  label: string
}

export interface NumberParamDef extends BaseParam {
  kind: 'number'
  min: number
  max: number
  step: number
  default: number
}

export interface BooleanParamDef extends BaseParam {
  kind: 'boolean'
  default: boolean
}

/** Id wideo z biblioteki; null = aktywne wideo. */
export interface VideoParamDef extends BaseParam {
  kind: 'video'
  default: null
}

export interface SelectParamDef extends BaseParam {
  kind: 'select'
  options: { value: number; label: string }[]
  default: number
}

export type ParamDef = NumberParamDef | BooleanParamDef | VideoParamDef | SelectParamDef

export interface NodeDef {
  type: NodeType
  label: string
  category: NodeCategory
  /** Wejście obrazu (port "input"). */
  videoIn: boolean
  /** Wyjście obrazu (port "video"). */
  videoOut: boolean
  /** Wejścia sygnału, które nie są parametrami (np. Math.in). */
  signalIn: string[]
  /** Wyjścia sygnału (0..1 lub dowolne liczby dla Math). */
  signalOut: string[]
  params: ParamDef[]
}

export const VIDEO_IN = 'input'
export const VIDEO_OUT = 'video'

const num = (
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  def: number
): NumberParamDef => ({ key, label, kind: 'number', min, max, step, default: def })

const filter = (type: NodeType, label: string, params: ParamDef[]): NodeDef => ({
  type,
  label,
  category: 'filter',
  videoIn: true,
  videoOut: true,
  signalIn: [],
  signalOut: [],
  params
})

export const NODE_DEFS: Record<NodeType, NodeDef> = {
  VideoFile: {
    type: 'VideoFile',
    label: 'Wideo',
    category: 'source',
    videoIn: false,
    videoOut: true,
    signalIn: [],
    signalOut: [],
    params: [
      { key: 'videoId', label: 'Plik', kind: 'video', default: null },
      { key: 'loop', label: 'Pętla', kind: 'boolean', default: true },
      num('speed', 'Prędkość', 0.1, 4, 0.05, 1)
    ]
  },
  BrightnessContrast: filter('BrightnessContrast', 'Jasność / kontrast', [
    num('brightness', 'Jasność', -1, 1, 0.01, 0),
    num('contrast', 'Kontrast', -1, 1, 0.01, 0)
  ]),
  HueSaturation: filter('HueSaturation', 'Barwa / nasycenie', [
    num('hue', 'Barwa (°)', -180, 180, 1, 0),
    num('saturation', 'Nasycenie', -1, 1, 0.01, 0)
  ]),
  Bloom: filter('Bloom', 'Bloom', [
    num('intensity', 'Intensywność', 0, 10, 0.05, 1.5),
    num('threshold', 'Próg jasności', 0, 1, 0.01, 0.4)
  ]),
  RGBSplit: filter('RGBSplit', 'RGB split', [
    num('amount', 'Przesunięcie', 0, 0.05, 0.0005, 0.003),
    num('angle', 'Kąt (°)', 0, 360, 1, 0)
  ]),
  Pixelate: filter('Pixelate', 'Pikselizacja', [
    num('granularity', 'Rozmiar piksela', 0, 64, 1, 0)
  ]),
  Glitch: filter('Glitch', 'Glitch', [num('amount', 'Siła', 0, 1, 0.01, 0)]),
  Noise: filter('Noise', 'Szum', [num('opacity', 'Krycie', 0, 1, 0.01, 0.15)]),
  Vignette: filter('Vignette', 'Winieta', [
    num('offset', 'Rozmiar', 0, 1, 0.01, 0.35),
    num('darkness', 'Ciemność', 0, 1, 0.01, 0.6)
  ]),
  AudioIn: {
    type: 'AudioIn',
    label: 'Audio',
    category: 'control',
    videoIn: false,
    videoOut: false,
    signalIn: [],
    signalOut: ['bass', 'mid', 'high', 'level', 'beat'],
    params: [num('gain', 'Wzmocnienie', 0, 4, 0.05, 1)]
  },
  LFO: {
    type: 'LFO',
    label: 'LFO',
    category: 'control',
    videoIn: false,
    videoOut: false,
    signalIn: [],
    signalOut: ['value'],
    params: [
      num('rate', 'Częstotliwość (Hz)', 0.01, 10, 0.01, 0.5),
      {
        key: 'shape',
        label: 'Kształt',
        kind: 'select',
        default: 0,
        options: [
          { value: 0, label: 'Sinus' },
          { value: 1, label: 'Trójkąt' },
          { value: 2, label: 'Piła' },
          { value: 3, label: 'Prostokąt' }
        ]
      }
    ]
  },
  Math: {
    type: 'Math',
    label: 'Math',
    category: 'control',
    videoIn: false,
    videoOut: false,
    signalIn: ['in'],
    signalOut: ['out'],
    params: [
      num('scale', 'Skala', -10, 10, 0.05, 1),
      num('offset', 'Offset', -5, 5, 0.01, 0),
      num('min', 'Min', -10, 10, 0.01, 0),
      num('max', 'Max', -10, 10, 0.01, 1)
    ]
  },
  Output: {
    type: 'Output',
    label: 'Wyjście',
    category: 'output',
    videoIn: true,
    videoOut: false,
    signalIn: [],
    signalOut: [],
    params: [num('resolution', 'Rozdzielczość renderu', 0.25, 1, 0.05, 1)]
  }
}

export const NODE_TYPES = Object.keys(NODE_DEFS) as NodeType[]
export const FILTER_TYPES = NODE_TYPES.filter((t) => NODE_DEFS[t].category === 'filter')

export function isNodeType(value: unknown): value is NodeType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(NODE_DEFS, value)
}

export function findParam(type: NodeType, key: string): ParamDef | undefined {
  return NODE_DEFS[type].params.find((p) => p.key === key)
}

export function findNumberParam(type: NodeType, key: string): NumberParamDef | undefined {
  const p = findParam(type, key)
  return p?.kind === 'number' ? p : undefined
}

export function defaultParams(type: NodeType): Record<string, number | boolean | null> {
  const out: Record<string, number | boolean | null> = {}
  for (const p of NODE_DEFS[type].params) out[p.key] = p.default
  return out
}

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v
