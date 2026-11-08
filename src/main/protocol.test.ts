import { describe, expect, it } from 'vitest'
import { parseAudioLevels, parseAudioStatus, parseClientMessage } from './protocol'

const parse = (v: unknown): ReturnType<typeof parseClientMessage> =>
  parseClientMessage(JSON.stringify(v))

describe('parseClientMessage', () => {
  it('odrzuca zły JSON, nie-obiekty i nieznane typy', () => {
    expect(parseClientMessage('{nie json')).toBeNull()
    expect(parse(42)).toBeNull()
    expect(parse(null)).toBeNull()
    expect(parse({ type: 'hack' })).toBeNull()
  })

  it('playback:select przyjmuje id albo null', () => {
    expect(parse({ type: 'playback:select', id: 'abc' })).toEqual({
      type: 'playback:select',
      id: 'abc'
    })
    expect(parse({ type: 'playback:select', id: null })).toEqual({
      type: 'playback:select',
      id: null
    })
    expect(parse({ type: 'playback:select', id: 5 })).toBeNull()
    expect(parse({ type: 'playback:select', id: 'x'.repeat(65) })).toBeNull()
  })

  it('effects:set akceptuje tylko proste wartości', () => {
    const ok = { type: 'effects:set', node: 'b1', param: 'intensity', value: 1.5 }
    expect(parse(ok)).toEqual(ok)
    expect(parse({ ...ok, value: true })).toEqual({ ...ok, value: true })
    expect(parse({ ...ok, value: null })).toEqual({ ...ok, value: null })
    expect(parse({ ...ok, value: { evil: 1 } })).toBeNull()
    expect(parse({ ...ok, node: 1 })).toBeNull()
  })

  it('node:bypass wymaga boolean', () => {
    expect(parse({ type: 'node:bypass', node: 'b1', bypass: true })).toEqual({
      type: 'node:bypass',
      node: 'b1',
      bypass: true
    })
    expect(parse({ type: 'node:bypass', node: 'b1', bypass: 'yes' })).toBeNull()
  })

  it('graph:set wymaga obiektu (resztę sprawdza sanitizeGraph)', () => {
    expect(parse({ type: 'graph:set', graph: { nodes: [] } })).toEqual({
      type: 'graph:set',
      graph: { nodes: [] }
    })
    expect(parse({ type: 'graph:set', graph: 'x' })).toBeNull()
  })

  it('output:fullscreen normalizuje displayId', () => {
    expect(parse({ type: 'output:fullscreen', on: true, displayId: 7 })).toEqual({
      type: 'output:fullscreen',
      on: true,
      displayId: 7
    })
    expect(parse({ type: 'output:fullscreen', on: false, displayId: 'x' })).toEqual({
      type: 'output:fullscreen',
      on: false,
      displayId: null
    })
    expect(parse({ type: 'output:fullscreen' })).toBeNull()
  })

  it('pozostałe wiadomości', () => {
    expect(parse({ type: 'audio:device', deviceId: null })).toEqual({
      type: 'audio:device',
      deviceId: null
    })
    expect(parse({ type: 'audio:device', deviceId: 3 })).toBeNull()
    expect(parse({ type: 'audio:loopback' })).toEqual({ type: 'audio:loopback' })
    expect(parse({ type: 'settings:lan', enabled: true })).toEqual({
      type: 'settings:lan',
      enabled: true
    })
    expect(parse({ type: 'settings:lan', enabled: 1 })).toBeNull()
  })
})

describe('parseAudioLevels', () => {
  it('przycina wartości do 0..1', () => {
    expect(parseAudioLevels({ bass: 2, mid: -1, high: 0.5, level: 0.2, beat: 1 })).toEqual({
      bass: 1,
      mid: 0,
      high: 0.5,
      level: 0.2,
      beat: 1
    })
  })

  it('odrzuca brakujące lub nieliczbowe pola', () => {
    expect(parseAudioLevels({ bass: 1, mid: 1, high: 1, level: 1 })).toBeNull()
    expect(parseAudioLevels({ bass: NaN, mid: 1, high: 1, level: 1, beat: 1 })).toBeNull()
    expect(parseAudioLevels('x')).toBeNull()
  })
})

describe('parseAudioStatus', () => {
  it('filtruje złe urządzenia i normalizuje pola', () => {
    const status = parseAudioStatus({
      devices: [{ deviceId: 'a', label: 'Loopback' }, { deviceId: 1 }, 'x'],
      activeId: 'a',
      activeLabel: 5,
      error: null
    })
    expect(status).toEqual({
      devices: [{ deviceId: 'a', label: 'Loopback' }],
      activeId: 'a',
      activeLabel: null,
      error: null
    })
  })

  it('ogranicza liczbę urządzeń', () => {
    const devices = Array.from({ length: 100 }, (_, i) => ({ deviceId: `d${i}`, label: `D${i}` }))
    expect(parseAudioStatus({ devices })?.devices).toHaveLength(64)
  })

  it('wymaga tablicy devices', () => {
    expect(parseAudioStatus({})).toBeNull()
  })
})
