// Wejście MIDI okna wizualizacji (Web MIDI). Słucha wszystkich wejść, bez SysEx,
// i zapisuje pady do MidiState. Brak zgody albo brak API = same zera, bez błędów.

import { MidiState } from './state'

export class MidiInput {
  readonly state = new MidiState()
  private access: MIDIAccess | null = null
  private disposed = false
  private readonly onMessage = (e: MIDIMessageEvent): void => {
    if (e.data) this.state.handle(e.data)
  }

  async start(): Promise<void> {
    const nav = navigator as Partial<Navigator>
    if (typeof nav.requestMIDIAccess !== 'function') {
      console.warn('MIDI: brak Web MIDI w tym oknie')
      return
    }
    let access: MIDIAccess
    try {
      access = await nav.requestMIDIAccess.call(navigator)
    } catch (err) {
      console.warn('MIDI: brak dostępu', err)
      return
    }
    if (this.disposed) return
    this.access = access
    access.inputs.forEach((input) => this.attach(input))
    access.onstatechange = (e): void => {
      const port = (e as MIDIConnectionEvent).port
      if (!port || port.type !== 'input') return
      if (port.state === 'disconnected') this.state.reset()
      else this.attach(port as MIDIInput)
    }
  }

  private attach(input: MIDIInput): void {
    input.onmidimessage = this.onMessage
  }

  dispose(): void {
    this.disposed = true
    if (!this.access) return
    this.access.onstatechange = null
    this.access.inputs.forEach((input) => {
      input.onmidimessage = null
    })
    this.access = null
  }
}
