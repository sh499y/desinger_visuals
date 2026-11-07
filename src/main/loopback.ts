// Wirtualne wejście audio z monitora domyślnego wyjścia (PipeWire/PulseAudio).
// Chromium nie pokazuje źródeł „Monitor of …” jako wejść, ale widzi źródło
// utworzone przez module-remap-source – stąd ten moduł.

import { execFile } from 'child_process'
import type { LoopbackStatus } from '@shared/types'

export const LOOPBACK_SOURCE = 'visualizer_loopback'

function pactl(...args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('pactl', args, { timeout: 5000 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout)
    )
  })
}

export class Loopback {
  private createdHere = false
  status: LoopbackStatus = { state: 'unavailable', error: null }

  /** Id modułów remap-source, które tworzą nasze źródło (także z poprzednich sesji). */
  private async moduleIds(): Promise<string[]> {
    const out = await pactl('list', 'short', 'modules')
    return out
      .split('\n')
      .filter(
        (l) => l.includes('module-remap-source') && l.includes(`source_name=${LOOPBACK_SOURCE}`)
      )
      .map((l) => l.split('\t')[0])
  }

  async refresh(): Promise<LoopbackStatus> {
    if (process.platform !== 'linux') {
      this.status = { state: 'unavailable', error: null }
      return this.status
    }
    try {
      const sources = await pactl('list', 'short', 'sources')
      const on = sources.split('\n').some((l) => l.split('\t')[1] === LOOPBACK_SOURCE)
      this.status = { state: on ? 'on' : 'off', error: null }
    } catch {
      this.status = {
        state: 'unavailable',
        error: 'Brak pactl (pulseaudio-utils / pipewire-pulse)'
      }
    }
    return this.status
  }

  /** Tworzy (albo odtwarza dla bieżącego domyślnego wyjścia) wejście Loopback. */
  async create(): Promise<LoopbackStatus> {
    try {
      await this.unloadModules()
      const sink = (await pactl('get-default-sink')).trim()
      if (!sink) throw new Error('Brak domyślnego wyjścia audio')
      await pactl(
        'load-module',
        'module-remap-source',
        `master=${sink}.monitor`,
        `source_name=${LOOPBACK_SOURCE}`,
        'source_properties=device.description=Visualizer-Loopback'
      )
      this.createdHere = true
      return this.refresh()
    } catch (err) {
      await this.refresh()
      this.status = { ...this.status, error: err instanceof Error ? err.message : String(err) }
      return this.status
    }
  }

  /** Przy zamknięciu: zdejmuje źródło, jeśli ta sesja je utworzyła. */
  async cleanup(): Promise<void> {
    if (this.createdHere) await this.unloadModules().catch(() => {})
  }

  private async unloadModules(): Promise<void> {
    for (const id of await this.moduleIds()) await pactl('unload-module', id)
  }
}
