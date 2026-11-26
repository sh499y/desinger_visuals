import { describe, expect, it } from 'vitest'
import { MidiState, padOfNote } from './state'

describe('padOfNote', () => {
  it('mapuje nuty 36–51 na pady 0–15, resztę na -1', () => {
    expect(padOfNote(36)).toBe(0)
    expect(padOfNote(51)).toBe(15)
    expect(padOfNote(35)).toBe(-1)
    expect(padOfNote(52)).toBe(-1)
  })
})

describe('MidiState', () => {
  it('note on ustawia siłę, nacisk, licznik i ostatni pad', () => {
    const s = new MidiState()
    s.handle([0x90, 36, 127])
    expect(s.velocity[0]).toBeCloseTo(1)
    expect(s.pressure[0]).toBeCloseTo(1)
    expect(s.hits[0]).toBe(1)
    expect(s.lastPad).toBe(0)
  })

  it('przyjmuje każdy kanał', () => {
    const s = new MidiState()
    s.handle([0x94, 40, 64])
    expect(s.hits[4]).toBe(1)
    expect(s.velocity[4]).toBeCloseTo(64 / 127)
  })

  it('poly aftertouch zmienia nacisk, nie licznik', () => {
    const s = new MidiState()
    s.handle([0x90, 36, 127])
    s.handle([0xa0, 36, 32])
    expect(s.pressure[0]).toBeCloseTo(32 / 127)
    expect(s.hits[0]).toBe(1)
  })

  it('note off i note on z velocity 0 puszczają pad', () => {
    for (const off of [
      [0x80, 36, 0],
      [0x90, 36, 0]
    ]) {
      const s = new MidiState()
      s.handle([0x90, 36, 100])
      s.handle(off)
      expect(s.pressure[0]).toBe(0)
      expect(s.hits[0]).toBe(1)
      expect(s.velocity[0]).toBeCloseTo(100 / 127)
    }
  })

  it('ignoruje nuty spoza padów, CC i za krótkie wiadomości', () => {
    const s = new MidiState()
    s.handle([0x90, 60, 100])
    s.handle([0xb0, 7, 90])
    s.handle([0x90, 36])
    expect(s.lastPad).toBe(-1)
    expect(Array.from(s.hits).every((h) => h === 0)).toBe(true)
  })

  it('reset zeruje nacisk i siłę, liczniki zostają', () => {
    const s = new MidiState()
    s.handle([0x90, 37, 127])
    s.reset()
    expect(s.pressure[1]).toBe(0)
    expect(s.velocity[1]).toBe(0)
    expect(s.lastPad).toBe(-1)
    expect(s.hits[1]).toBe(1)
  })
})
