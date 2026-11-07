// Wykrywanie beatu z energii basu: beat, gdy energia wyraźnie przekracza
// średnią z ostatnich ~0,7 s. Wyjście to obwiednia 1 → 0, wygodna jako sygnał.

export interface BeatOptions {
  /** Liczba ostatnich próbek do średniej (przy 60 fps ≈ 0,7 s). */
  history?: number
  /** Ile razy energia musi przekroczyć średnią. */
  sensitivity?: number
  /** Minimalna energia, żeby cisza nie dawała beatów. */
  minEnergy?: number
  cooldownMs?: number
  /** Szybkość zaniku obwiedni (1/s). */
  decayPerSecond?: number
}

export class BeatDetector {
  private readonly buf: Float32Array
  private readonly sensitivity: number
  private readonly minEnergy: number
  private readonly cooldownMs: number
  private readonly decay: number
  private index = 0
  private filled = 0
  private sum = 0
  private lastBeat = -Infinity
  private lastTime: number | null = null

  envelope = 0
  triggered = false

  constructor(opts: BeatOptions = {}) {
    this.buf = new Float32Array(opts.history ?? 43)
    this.sensitivity = opts.sensitivity ?? 1.3
    this.minEnergy = opts.minEnergy ?? 0.15
    this.cooldownMs = opts.cooldownMs ?? 220
    this.decay = opts.decayPerSecond ?? 5
  }

  /** `energy` 0..1, `now` w ms. Zwraca obwiednię beatu 0..1. */
  update(energy: number, now: number): number {
    const dt = this.lastTime === null ? 0 : Math.max(0, now - this.lastTime) / 1000
    this.lastTime = now
    this.envelope *= Math.exp(-this.decay * dt)

    const n = this.buf.length
    const avg = this.filled > 0 ? this.sum / this.filled : 0
    this.triggered =
      this.filled >= n / 2 &&
      energy > this.minEnergy &&
      energy > avg * this.sensitivity &&
      now - this.lastBeat >= this.cooldownMs
    if (this.triggered) {
      this.lastBeat = now
      this.envelope = 1
    }

    this.sum += energy - this.buf[this.index]
    this.buf[this.index] = energy
    this.index = (this.index + 1) % n
    if (this.filled < n) this.filled++
    return this.envelope
  }
}
