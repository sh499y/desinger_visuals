import { afterEach, describe, expect, it, vi } from 'vitest'
import { MidiInput } from './input'

interface FakeInput {
  type: 'input'
  state: 'connected' | 'disconnected'
  onmidimessage: ((e: { data: Uint8Array }) => void) | null
}

const fakeInput = (): FakeInput => ({ type: 'input', state: 'connected', onmidimessage: null })

function fakeAccess(...inputs: FakeInput[]): {
  inputs: Map<string, FakeInput>
  onstatechange: ((e: { port: FakeInput }) => void) | null
} {
  return { inputs: new Map(inputs.map((x, i) => [String(i), x])), onstatechange: null }
}

const send = (input: FakeInput, ...bytes: number[]): void =>
  input.onmidimessage?.({ data: Uint8Array.from(bytes) })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('MidiInput', () => {
  it('wiadomości z wejścia trafiają do stanu', async () => {
    const input = fakeInput()
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn().mockResolvedValue(fakeAccess(input)) })
    const midi = new MidiInput()
    await midi.start()
    send(input, 0x90, 36, 100)
    expect(midi.state.hits[0]).toBe(1)
  })

  it('prosi o MIDI bez SysEx', async () => {
    const request = vi.fn().mockResolvedValue(fakeAccess())
    vi.stubGlobal('navigator', { requestMIDIAccess: request })
    await new MidiInput().start()
    expect(request.mock.calls[0][0]?.sysex ?? false).toBe(false)
  })

  it('rozłączenie wejścia puszcza wciśnięte pady', async () => {
    const input = fakeInput()
    const access = fakeAccess(input)
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn().mockResolvedValue(access) })
    const midi = new MidiInput()
    await midi.start()
    send(input, 0x90, 36, 100)
    input.state = 'disconnected'
    access.onstatechange?.({ port: input })
    expect(midi.state.pressure[0]).toBe(0)
  })

  it('podpina wejście podłączone po starcie', async () => {
    const access = fakeAccess()
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn().mockResolvedValue(access) })
    const midi = new MidiInput()
    await midi.start()
    const late = fakeInput()
    access.inputs.set('late', late)
    access.onstatechange?.({ port: late })
    send(late, 0x90, 37, 100)
    expect(midi.state.hits[1]).toBe(1)
  })

  it('brak zgody albo brak Web MIDI nie wywraca startu', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn().mockRejectedValue(new Error('nope')) })
    await expect(new MidiInput().start()).resolves.toBeUndefined()
    vi.stubGlobal('navigator', {})
    await expect(new MidiInput().start()).resolves.toBeUndefined()
  })

  it('dispose odpina handlery', async () => {
    const input = fakeInput()
    const access = fakeAccess(input)
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn().mockResolvedValue(access) })
    const midi = new MidiInput()
    await midi.start()
    midi.dispose()
    expect(input.onmidimessage).toBeNull()
    expect(access.onstatechange).toBeNull()
  })
})
