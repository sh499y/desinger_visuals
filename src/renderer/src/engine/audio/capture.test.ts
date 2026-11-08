import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioDeviceInfo, AudioStatus } from '@shared/types'
import { AudioInput, pickLoopback } from './capture'

// --- Udawane API przeglądarki (navigator.mediaDevices + AudioContext) ---

interface Device {
  deviceId: string
  label: string
  kind: MediaDeviceKind
}

let devices: Device[]
let gumError: Error | null
let deviceChange: (() => void) | null
const opened: (MediaStreamConstraints | undefined)[] = []
const stopped: string[] = []

function track(id: string): MediaStreamTrack {
  return { stop: () => stopped.push(id), label: id } as unknown as MediaStreamTrack
}

const mediaDevices = {
  getUserMedia: vi.fn(async (c?: MediaStreamConstraints) => {
    opened.push(c)
    if (gumError) throw gumError
    const id = ((c?.audio as MediaTrackConstraints | undefined)?.deviceId as { exact?: string })
      ?.exact
    return { getTracks: () => [track(id ?? 'probe')] } as unknown as MediaStream
  }),
  enumerateDevices: vi.fn(async () => devices),
  addEventListener: (_: string, cb: () => void) => (deviceChange = cb),
  removeEventListener: () => (deviceChange = null)
}

class FakeAudioContext {
  state = 'suspended'
  sampleRate = 48000
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  close = vi.fn(async () => {})
  createMediaStreamSource = (): { connect: () => void; disconnect: () => void } => ({
    connect: vi.fn(),
    disconnect: vi.fn()
  })
  createAnalyser = (): object => ({
    fftSize: 0,
    frequencyBinCount: 1024,
    context: this,
    getByteFrequencyData: (a: Uint8Array) => a.fill(255),
    getFloatTimeDomainData: (a: Float32Array) => a.fill(0)
  })
}

const input = (id: string, label: string): Device => ({ deviceId: id, label, kind: 'audioinput' })

beforeEach(() => {
  devices = [
    input('default', 'Default'),
    { deviceId: 'spk', label: 'Głośniki', kind: 'audiooutput' },
    input('mic', 'Mikrofon USB'),
    input('lb', 'Visualizer-Loopback')
  ]
  gumError = null
  deviceChange = null
  opened.length = 0
  stopped.length = 0
  vi.stubGlobal('navigator', { mediaDevices })
  vi.stubGlobal('AudioContext', FakeAudioContext)
})

async function settle(onStatus: ReturnType<typeof vi.fn>, calls = 1): Promise<AudioStatus> {
  await vi.waitFor(() => expect(onStatus.mock.calls.length).toBeGreaterThanOrEqual(calls))
  return onStatus.mock.calls.at(-1)![0]
}

describe('pickLoopback', () => {
  const list: AudioDeviceInfo[] = [
    { deviceId: '1', label: 'Mic' },
    { deviceId: '2', label: 'Monitor of FiiO' }
  ]
  it('znajduje loopback albo monitor', () => {
    expect(pickLoopback(list)?.deviceId).toBe('2')
    expect(pickLoopback([{ deviceId: '3', label: 'Loopback' }])?.deviceId).toBe('3')
    expect(pickLoopback([list[0]])).toBeNull()
  })
})

describe('AudioInput', () => {
  it('bez wskazania wybiera loopback i wyłącza obróbkę głosu', async () => {
    const onStatus = vi.fn()
    const audio = new AudioInput(onStatus)
    audio.request(null)
    const status = await settle(onStatus)
    expect(status).toEqual({
      devices: [
        { deviceId: 'default', label: 'Default' },
        { deviceId: 'mic', label: 'Mikrofon USB' },
        { deviceId: 'lb', label: 'Visualizer-Loopback' }
      ],
      activeId: 'lb',
      activeLabel: 'Visualizer-Loopback',
      error: null
    })
    expect(opened.at(-1)).toEqual({
      audio: {
        deviceId: { exact: 'lb' },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })
    // Strumień próbny (tylko po zgodę) jest od razu zamykany.
    expect(stopped).toContain('probe')
  })

  it('używa urządzenia wskazanego w panelu', async () => {
    const onStatus = vi.fn()
    new AudioInput(onStatus).request('mic')
    expect((await settle(onStatus)).activeId).toBe('mic')
  })

  it('bez loopbacka bierze pierwsze wejście', async () => {
    devices = [input('mic', 'Mikrofon')]
    const onStatus = vi.fn()
    new AudioInput(onStatus).request('nieistniejące')
    expect((await settle(onStatus)).activeId).toBe('mic')
  })

  it('zgłasza błąd, gdy nie ma wejść', async () => {
    devices = []
    gumError = Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' })
    const onStatus = vi.fn()
    new AudioInput(onStatus).request(null)
    const status = await settle(onStatus)
    expect(status.error).toBe('Requested device not found')
    expect(status.activeId).toBeNull()
  })

  it('ta sama prośba drugi raz nic nie robi', async () => {
    const onStatus = vi.fn()
    const audio = new AudioInput(onStatus)
    audio.request('mic')
    await settle(onStatus)
    const before = mediaDevices.getUserMedia.mock.calls.length
    audio.request('mic')
    await new Promise((r) => setTimeout(r, 10))
    expect(mediaDevices.getUserMedia.mock.calls.length).toBe(before)
  })

  it('przełącza się na loopback, gdy pojawi się później', async () => {
    devices = [input('mic', 'Mikrofon')]
    const onStatus = vi.fn()
    new AudioInput(onStatus).request(null)
    expect((await settle(onStatus)).activeId).toBe('mic')

    devices.push(input('lb', 'Visualizer-Loopback'))
    deviceChange!()
    expect((await settle(onStatus, 2)).activeId).toBe('lb')
    expect(stopped).toContain('mic')
  })

  it('update: cisza przed startem, potem poziomy z analizatora', async () => {
    const onStatus = vi.fn()
    const audio = new AudioInput(onStatus)
    expect(audio.update(0)).toEqual({ bass: 0, mid: 0, high: 0, level: 0, beat: 0 })
    audio.request(null)
    await settle(onStatus)
    expect(audio.update(16).bass).toBeGreaterThan(0)
  })

  it('dispose zamyka strumień i odpina nasłuch zmian urządzeń', async () => {
    const onStatus = vi.fn()
    const audio = new AudioInput(onStatus)
    audio.request('mic')
    await settle(onStatus)
    audio.dispose()
    expect(stopped).toContain('mic')
    expect(deviceChange).toBeNull()
  })
})
