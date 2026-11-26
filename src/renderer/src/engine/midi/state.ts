// Stan padów Akai MPC Sample z wiadomości MIDI. Stałe tablice, bez alokacji w handle().
// Pady wysyłają nuty 36–51 (pad 1 = 36), velocity i poly aftertouch, na dowolnym kanale.

export const PAD_COUNT = 16
export const FIRST_PAD_NOTE = 36

/** Indeks padu 0..15 dla nuty albo -1. */
export function padOfNote(note: number): number {
  const pad = note - FIRST_PAD_NOTE
  return pad >= 0 && pad < PAD_COUNT ? pad : -1
}

export class MidiState {
  /** Siła ostatniego uderzenia 0..1. */
  readonly velocity = new Float32Array(PAD_COUNT)
  /** Nacisk 0..1, dopóki pad jest wciśnięty. */
  readonly pressure = new Float32Array(PAD_COUNT)
  /** Licznik uderzeń (rośnie przy każdym note on). */
  readonly hits = new Uint32Array(PAD_COUNT)
  /** Ostatnio uderzony pad albo -1. */
  lastPad = -1

  handle(data: ArrayLike<number>): void {
    if (data.length < 3) return
    const status = data[0] & 0xf0
    const pad = padOfNote(data[1])
    if (pad < 0) return
    const value = data[2] / 127
    if (status === 0x90 && data[2] > 0) {
      this.velocity[pad] = value
      this.pressure[pad] = value
      this.hits[pad]++
      this.lastPad = pad
    } else if (status === 0x80 || status === 0x90) {
      this.pressure[pad] = 0
    } else if (status === 0xa0) {
      this.pressure[pad] = value
    }
  }

  /** Po rozłączeniu urządzenia: puszcza wszystkie pady. Liczniki zostają. */
  reset(): void {
    this.velocity.fill(0)
    this.pressure.fill(0)
    this.lastPad = -1
  }
}
