// Prawa kolumna: podgląd, audio, wyjście, projekty.

import { useEffect, useRef, useState } from 'react'
import type { ProjectInfo } from '@shared/types'
import { api, postJson, url } from '../api'
import { createLoopback, setAudioDevice, setFullscreen, usePanel } from '../store'
import { Button, Section, selectClass } from './ui'

export function Preview(): React.JSX.Element {
  const [on, setOn] = useState(true)
  const [tick, setTick] = useState(0)
  const [ok, setOk] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  // Kolejna klatka dopiero po wczytaniu poprzedniej (~4 kl./s).
  const next = (delay: number): void => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setTick((t) => t + 1), delay)
  }

  return (
    <Section
      title="Podgląd"
      actions={
        <Button variant="ghost" onClick={() => setOn(!on)}>
          {on ? 'wyłącz' : 'włącz'}
        </Button>
      }
    >
      {on ? (
        <div className="aspect-video overflow-hidden rounded bg-black">
          <img
            src={url(`/api/preview.jpg?t=${tick}`)}
            alt="Podgląd wyjścia"
            className={`h-full w-full object-contain ${ok ? '' : 'opacity-0'}`}
            onLoad={() => {
              setOk(true)
              next(250)
            }}
            onError={() => {
              setOk(false)
              next(1000)
            }}
          />
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Podgląd wyłączony.</p>
      )}
    </Section>
  )
}

const BARS = [
  { key: 'bass', label: 'Bass', color: 'bg-violet-500' },
  { key: 'mid', label: 'Mid', color: 'bg-fuchsia-500' },
  { key: 'high', label: 'High', color: 'bg-cyan-400' },
  { key: 'level', label: 'Level', color: 'bg-neutral-300' },
  { key: 'beat', label: 'Beat', color: 'bg-amber-400' }
] as const

export function AudioPanel(): React.JSX.Element {
  const audio = usePanel((s) => s.audio)
  const status = usePanel((s) => s.app!.audio)
  const loopback = status.loopback
  const noMonitor =
    status.devices.length > 0 && !status.devices.some((d) => /monitor|loopback/i.test(d.label))

  return (
    <Section title="Audio">
      <div className="space-y-1.5">
        {BARS.map((b) => (
          <div key={b.key} className="flex items-center gap-2 text-[11px]">
            <span className="w-10 text-neutral-400">{b.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded bg-neutral-800">
              <div
                className={`h-full ${b.color}`}
                style={{ width: `${Math.round(audio[b.key] * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <label className="mt-3 block text-xs text-neutral-400">
        Wejście
        <select
          className={selectClass}
          value={status.deviceId ?? ''}
          onChange={(e) => setAudioDevice(e.target.value || null)}
        >
          <option value="">Automatycznie (loopback / monitor)</option>
          {status.devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-1 text-[11px] text-neutral-500">Aktywne: {status.activeLabel ?? '–'}</div>
      {status.error && <div className="mt-1 text-xs text-red-400">{status.error}</div>}
      {loopback.state !== 'unavailable' && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-neutral-400">
          <span>
            Loopback systemu:{' '}
            <b className={loopback.state === 'on' ? 'text-emerald-400' : 'text-amber-300'}>
              {loopback.state === 'on' ? 'aktywny' : 'brak'}
            </b>
          </span>
          <Button
            title="Tworzy wirtualne wejście z monitora bieżącego domyślnego wyjścia (pactl)"
            onClick={createLoopback}
          >
            {loopback.state === 'on' ? 'odtwórz' : 'utwórz'}
          </Button>
        </div>
      )}
      {loopback.error && <div className="mt-1 text-xs text-red-400">{loopback.error}</div>}
      {noMonitor && loopback.state !== 'on' && (
        <details className="mt-2 text-[11px] text-neutral-400">
          <summary className="cursor-pointer text-amber-300">Nie widać dźwięku z systemu?</summary>
          <p className="mt-1">Utwórz wirtualne wejście z monitora domyślnego wyjścia:</p>
          <pre className="mt-1 overflow-x-auto rounded bg-neutral-950 p-2 text-[10px]">
            {`pactl load-module module-remap-source \\
  master=$(pactl get-default-sink).monitor \\
  source_name=loopback \\
  source_properties=device.description=Loopback`}
          </pre>
          <p className="mt-1">
            Albo w pavucontrol → Nagrywanie przełącz Visualizer na „Monitor of …”.
          </p>
        </details>
      )}
    </Section>
  )
}

export function OutputPanel(): React.JSX.Element {
  const output = usePanel((s) => s.app!.output)
  const [displayId, setDisplayId] = useState<number | null>(null)
  const chosen = output.displays.some((d) => d.id === displayId) ? displayId : null

  return (
    <Section title="Wyjście">
      <label className="block text-xs text-neutral-400">
        Ekran
        <select
          className={selectClass}
          value={chosen ?? ''}
          onChange={(e) => setDisplayId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Bieżący ekran okna</option>
          {output.displays.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} ({d.width}×{d.height}){d.primary ? ' · główny' : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 flex items-center gap-2">
        <Button variant="primary" onClick={() => setFullscreen(true, chosen)}>
          Pełny ekran
        </Button>
        <Button disabled={!output.fullscreen} onClick={() => setFullscreen(false, null)}>
          Okno
        </Button>
        <span className="text-[11px] text-neutral-500">
          {output.fullscreen ? 'pełny ekran' : 'w oknie'}
        </span>
      </div>
    </Section>
  )
}

export function ProjectsPanel(): React.JSX.Element {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const run = async (fn: () => Promise<ProjectInfo[] | void>): Promise<void> => {
    setError(null)
    try {
      const list = await fn()
      setProjects(list ?? (await api<ProjectInfo[]>('/api/projects')))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    api<ProjectInfo[]>('/api/projects')
      .then(setProjects)
      .catch((err) => setError(String(err)))
  }, [])

  const cleanName = (s: string): string =>
    s
      .replace(/\.json$/i, '')
      .replace(/[^\p{L}\p{N} _-]/gu, '_')
      .trim()
      .slice(0, 64)

  return (
    <Section
      title="Projekty"
      actions={
        <Button
          variant="ghost"
          title="Wczytaj plik .json"
          onClick={() => fileInput.current?.click()}
        >
          import
        </Button>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          void run(async () => {
            const graph = JSON.parse(await file.text())
            return postJson<ProjectInfo[]>('/api/projects', {
              name: cleanName(file.name) || 'import',
              graph
            })
          })
        }}
      />
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          const n = cleanName(name)
          if (n) void run(() => postJson<ProjectInfo[]>('/api/projects', { name: n }))
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs"
          placeholder="Nazwa projektu"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className="rounded bg-violet-600 px-2 text-xs font-medium text-white hover:bg-violet-500"
        >
          Zapisz
        </button>
      </form>
      {error && <div className="mt-1 text-xs text-red-400">{error}</div>}
      <ul className="mt-2 space-y-1">
        {projects.map((p) => (
          <li key={p.name} className="flex items-center gap-1 text-xs">
            <span className="min-w-0 flex-1 truncate" title={new Date(p.savedAt).toLocaleString()}>
              {p.name}
            </span>
            <Button
              onClick={() =>
                void run(() =>
                  api(`/api/projects/${encodeURIComponent(p.name)}/load`, { method: 'POST' })
                )
              }
            >
              wczytaj
            </Button>
            <a
              className="rounded px-2 py-1 text-neutral-300 hover:bg-neutral-800"
              href={url(`/api/projects/${encodeURIComponent(p.name)}`)}
              download={`${p.name}.json`}
            >
              ↓
            </a>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm(`Usunąć projekt „${p.name}”?`)) {
                  void run(() =>
                    api<ProjectInfo[]>(`/api/projects/${encodeURIComponent(p.name)}`, {
                      method: 'DELETE'
                    })
                  )
                }
              }}
            >
              ✕
            </Button>
          </li>
        ))}
        {projects.length === 0 && (
          <li className="text-xs text-neutral-500">Brak zapisanych projektów.</li>
        )}
      </ul>
    </Section>
  )
}
