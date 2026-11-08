import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Udawany pactl: stan modułów i źródeł w pamięci.
const pa = vi.hoisted(() => ({
  available: true,
  sink: 'alsa_output.usb',
  modules: [] as { id: string; args: string }[],
  sources: ['alsa_output.usb.monitor'],
  calls: [] as string[][],
  nextId: 100
}))

vi.mock('child_process', () => ({
  execFile: (
    _cmd: string,
    args: string[],
    _opts: unknown,
    cb: (err: Error | null, out: string) => void
  ) => {
    pa.calls.push(args)
    if (!pa.available) return cb(new Error('spawn pactl ENOENT'), '')
    const [a, b, c] = args
    if (a === 'list' && c === 'modules') {
      return cb(null, pa.modules.map((m) => `${m.id}\tmodule-remap-source\t${m.args}`).join('\n'))
    }
    if (a === 'list' && c === 'sources') {
      return cb(null, pa.sources.map((s, i) => `${i}\t${s}\tPipeWire\ts32le\tRUNNING`).join('\n'))
    }
    if (a === 'get-default-sink') return cb(null, `${pa.sink}\n`)
    if (a === 'load-module' && b === 'module-remap-source') {
      const id = String(pa.nextId++)
      const rest = args.slice(2).join(' ')
      pa.modules.push({ id, args: rest })
      pa.sources.push(/source_name=(\S+)/.exec(rest)![1])
      return cb(null, `${id}\n`)
    }
    if (a === 'unload-module') {
      const m = pa.modules.find((x) => x.id === b)
      pa.modules = pa.modules.filter((x) => x.id !== b)
      if (m) pa.sources = pa.sources.filter((s) => !m.args.includes(`source_name=${s}`))
      return cb(null, '')
    }
    return cb(new Error(`nieznane: ${args.join(' ')}`), '')
  }
}))

import { LOOPBACK_SOURCE, Loopback } from './loopback'

const platform = process.platform

beforeEach(() => {
  pa.available = true
  pa.sink = 'alsa_output.usb'
  pa.modules = []
  pa.sources = ['alsa_output.usb.monitor']
  pa.calls = []
  Object.defineProperty(process, 'platform', { value: 'linux' })
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
})

describe('Loopback', () => {
  it('refresh: off, gdy źródła nie ma', async () => {
    expect(await new Loopback().refresh()).toEqual({ state: 'off', error: null })
  })

  it('refresh: unavailable, gdy brak pactl', async () => {
    pa.available = false
    const s = await new Loopback().refresh()
    expect(s.state).toBe('unavailable')
    expect(s.error).toMatch(/pactl/)
  })

  it('refresh: unavailable poza Linuksem (bez wołania pactl)', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    expect(await new Loopback().refresh()).toEqual({ state: 'unavailable', error: null })
    expect(pa.calls).toEqual([])
  })

  it('create tworzy źródło z monitora domyślnego wyjścia', async () => {
    const lb = new Loopback()
    expect(await lb.create()).toEqual({ state: 'on', error: null })
    const load = pa.calls.find((c) => c[0] === 'load-module')!
    expect(load).toContain('master=alsa_output.usb.monitor')
    expect(load).toContain(`source_name=${LOOPBACK_SOURCE}`)
  })

  it('create usuwa stare moduły (np. po crashu) zamiast dublować', async () => {
    await new Loopback().create()
    pa.sink = 'hdmi'
    await new Loopback().create()
    expect(pa.modules).toHaveLength(1)
    expect(pa.modules[0].args).toContain('master=hdmi.monitor')
  })

  it('create zwraca błąd, gdy nie ma domyślnego wyjścia', async () => {
    pa.sink = ''
    const s = await new Loopback().create()
    expect(s.state).toBe('off')
    expect(s.error).toMatch(/domyślnego wyjścia/)
  })

  it('cleanup zdejmuje źródło tylko, jeśli ta sesja je utworzyła', async () => {
    await new Loopback().create()
    await new Loopback().cleanup()
    expect(pa.modules).toHaveLength(1)

    const lb = new Loopback()
    await lb.create()
    await lb.cleanup()
    expect(pa.modules).toHaveLength(0)
    expect(pa.sources).not.toContain(LOOPBACK_SOURCE)
  })
})
