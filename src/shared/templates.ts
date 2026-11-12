// Gotowe szablony grafu do szybkiego testowania. Czyste dane: przechodzą przez
// `sanitizeGraph`, więc są zawsze zgodne z definicjami node'ów.

import { sanitizeGraph } from './graph'
import { defaultParams, type NodeType } from './nodes'
import type { Graph, GraphEdge, GraphNode, ParamValue } from './types'

export interface GraphTemplate {
  id: string
  name: string
  description: string
  graph: Graph
}

const n = (
  id: string,
  type: NodeType,
  x: number,
  y: number,
  params: Record<string, ParamValue> = {}
): GraphNode => ({ id, type, params: { ...defaultParams(type), ...params }, position: { x, y } })

/** Łańcuch obrazu: kolejne node'y połączone portami video. */
const chain = (...ids: string[]): GraphEdge[] =>
  ids.slice(1).map((id, i) => ({ from: `${ids[i]}.video`, to: `${id}.input` }))

const make = (nodes: GraphNode[], edges: GraphEdge[]): Graph =>
  sanitizeGraph({ version: 1, nodes, edges })

export const TEMPLATES: GraphTemplate[] = [
  {
    id: 'neon-pulse',
    name: 'Neon Pulse',
    description: 'Bloom pulsuje basem, RGB split uderza na beat.',
    graph: make(
      [
        n('v1', 'VideoFile', 0, 0),
        n('huesaturation1', 'HueSaturation', 240, 0, { saturation: 0.35 }),
        n('bloom1', 'Bloom', 480, 0),
        n('rgbsplit1', 'RGBSplit', 720, 0),
        n('vignette1', 'Vignette', 960, 0),
        n('out', 'Output', 1200, 0),
        n('a1', 'AudioIn', 240, 260)
      ],
      [
        ...chain('v1', 'huesaturation1', 'bloom1', 'rgbsplit1', 'vignette1', 'out'),
        { from: 'a1.bass', to: 'bloom1.intensity', scale: 4, offset: 0.5 },
        { from: 'a1.beat', to: 'rgbsplit1.amount', scale: 0.015, offset: 0.002 }
      ]
    )
  },
  {
    id: 'glitch-storm',
    name: 'Glitch Storm',
    description: 'Zakłócenia i szum rosną z wysokimi tonami i beatem.',
    graph: make(
      [
        n('v1', 'VideoFile', 0, 0),
        n('contrast1', 'BrightnessContrast', 240, 0, { contrast: 0.25 }),
        n('glitch1', 'Glitch', 480, 0),
        n('rgbsplit1', 'RGBSplit', 720, 0),
        n('noise1', 'Noise', 960, 0),
        n('out', 'Output', 1200, 0),
        n('a1', 'AudioIn', 240, 260)
      ],
      [
        ...chain('v1', 'contrast1', 'glitch1', 'rgbsplit1', 'noise1', 'out'),
        { from: 'a1.beat', to: 'glitch1.amount', scale: 1, offset: 0 },
        { from: 'a1.high', to: 'rgbsplit1.amount', scale: 0.03, offset: 0.001 },
        { from: 'a1.level', to: 'noise1.opacity', scale: 0.5, offset: 0.1 }
      ]
    )
  },
  {
    id: 'pixel-rave',
    name: 'Pixel Rave',
    description: 'Pikselizacja skacze z basem, kolory kręcą się na LFO.',
    graph: make(
      [
        n('v1', 'VideoFile', 0, 0),
        n('huesaturation1', 'HueSaturation', 240, 0, { saturation: 0.5 }),
        n('pixelate1', 'Pixelate', 480, 0),
        n('bloom1', 'Bloom', 720, 0, { intensity: 1 }),
        n('out', 'Output', 960, 0),
        n('a1', 'AudioIn', 240, 260),
        n('lfo1', 'LFO', 0, 260, { rate: 0.1, shape: 2 })
      ],
      [
        ...chain('v1', 'huesaturation1', 'pixelate1', 'bloom1', 'out'),
        { from: 'lfo1.value', to: 'huesaturation1.hue', scale: 360, offset: -180 },
        { from: 'a1.bass', to: 'pixelate1.granularity', scale: 40, offset: 0 },
        { from: 'a1.mid', to: 'bloom1.intensity', scale: 3, offset: 0.5 }
      ]
    )
  },
  {
    id: 'dream-wave',
    name: 'Dream Wave',
    description: 'Miękki, falujący obraz: LFO steruje barwą i jasnością.',
    graph: make(
      [
        n('v1', 'VideoFile', 0, 0),
        n('huesaturation1', 'HueSaturation', 240, 0, { saturation: 0.2 }),
        n('brightness1', 'BrightnessContrast', 480, 0),
        n('bloom1', 'Bloom', 720, 0, { threshold: 0.2 }),
        n('vignette1', 'Vignette', 960, 0, { darkness: 0.5 }),
        n('out', 'Output', 1200, 0),
        n('lfo1', 'LFO', 0, 260, { rate: 0.15 }),
        n('a1', 'AudioIn', 240, 260)
      ],
      [
        ...chain('v1', 'huesaturation1', 'brightness1', 'bloom1', 'vignette1', 'out'),
        { from: 'lfo1.value', to: 'huesaturation1.hue', scale: 120, offset: -60 },
        { from: 'lfo1.value', to: 'brightness1.brightness', scale: 0.2, offset: -0.1 },
        { from: 'a1.level', to: 'bloom1.intensity', scale: 3, offset: 1 },
        { from: 'a1.mid', to: 'vignette1.darkness', scale: 0.4, offset: 0.3 }
      ]
    )
  }
]
