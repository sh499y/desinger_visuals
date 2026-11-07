// Przechwytywanie dźwięku z systemu. Na Linuksie to zwykłe wejście audio:
// źródło „Monitor of …” z PipeWire/PulseAudio albo wirtualne „Loopback”.

import type { AudioDeviceInfo, AudioLevels, AudioStatus } from '@shared/types'
import { AudioAnalyser } from './analyser'

const SILENCE: AudioLevels = { bass: 0, mid: 0, high: 0, level: 0, beat: 0 }

export function pickLoopback(devices: AudioDeviceInfo[]): AudioDeviceInfo | null {
  return devices.find((d) => /loopback|monitor/i.test(d.label)) ?? null
}

async function listInputs(): Promise<AudioDeviceInfo[]> {
  const all = await navigator.mediaDevices.enumerateDevices()
  return all
    .filter((d) => d.kind === 'audioinput' && d.deviceId)
    .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Wejście audio' }))
}

export class AudioInput {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AudioAnalyser | null = null
  private permission = false
  private queue: Promise<void> = Promise.resolve()
  private requested: string | null | undefined = undefined
  private status: AudioStatus = { devices: [], activeId: null, activeLabel: null, error: null }

  constructor(private readonly onStatus: (status: AudioStatus) => void) {
    navigator.mediaDevices.addEventListener('devicechange', this.onDeviceChange)
  }

  /** Aktualne poziomy; cisza, gdy nic nie jest podłączone. */
  update(now: number): AudioLevels {
    return this.analyser ? this.analyser.update(now) : SILENCE
  }

  /** Wybiera urządzenie: zadane z panelu, inaczej loopback/monitor, inaczej pierwsze. */
  request(deviceId: string | null): void {
    if (deviceId === this.requested) return
    this.requested = deviceId
    this.enqueue()
  }

  private onDeviceChange = (): void => this.enqueue()

  private enqueue(): void {
    this.queue = this.queue.then(() => this.sync()).catch(() => {})
  }

  private async sync(): Promise<void> {
    try {
      if (!this.permission) {
        // Bez zgody enumerateDevices nie zwraca etykiet.
        const s = await navigator.mediaDevices.getUserMedia({ audio: true })
        s.getTracks().forEach((t) => t.stop())
        this.permission = true
      }
      const devices = await listInputs()
      const want =
        devices.find((d) => d.deviceId === this.requested) ??
        pickLoopback(devices) ??
        devices[0] ??
        null
      if (!want) {
        this.stop()
        this.report({ devices, activeId: null, activeLabel: null, error: 'Brak wejść audio' })
        return
      }
      if (want.deviceId !== this.status.activeId || !this.stream) await this.start(want.deviceId)
      this.report({ devices, activeId: want.deviceId, activeLabel: want.label, error: null })
    } catch (err) {
      this.stop()
      this.report({
        ...this.status,
        activeId: null,
        activeLabel: null,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  private async start(deviceId: string): Promise<void> {
    this.stop()
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })
    this.ctx ??= new AudioContext({ latencyHint: 'interactive' })
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.source = this.ctx.createMediaStreamSource(this.stream)
    const node = this.ctx.createAnalyser()
    // Tylko analiza: nie podłączamy do głośników, żeby nie było sprzężenia.
    this.source.connect(node)
    this.analyser = new AudioAnalyser(node)
  }

  private stop(): void {
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.source = null
    this.stream = null
    this.analyser = null
  }

  private report(status: AudioStatus): void {
    this.status = status
    this.onStatus(status)
  }

  dispose(): void {
    navigator.mediaDevices.removeEventListener('devicechange', this.onDeviceChange)
    this.stop()
    void this.ctx?.close()
    this.ctx = null
  }
}
