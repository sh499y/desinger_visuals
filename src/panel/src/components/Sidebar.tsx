// Prawa kolumna: podgląd, audio, wyjście, projekty.

import { useEffect, useRef, useState } from 'react'
import type { ProjectInfo } from '@shared/types'
import { api, postJson, url } from '../api'
import { TEMPLATES } from '@shared/templates'
import { asciiBar } from '../ascii'
import { termVar, type TermColor } from '../palette'
import { commitGraph, createLoopback, setAudioDevice, setFullscreen, usePanel } from '../store'
import { AsciiBox, Button, ConfirmButton, Section, Tag, selectClass } from './ui'

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
      index={2}
      actions={
        <Button variant="link" onClick={() => setOn(!on)}>
          {on ? 'wyłącz' : 'włącz'}
        </Button>
      }
    >
      {on ? (
        <div className="aspect-video overflow-hidden bg-black">
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
        <p className="text-muted">Podgląd wyłączony.</p>
      )}
    </Section>
  )
}

const CELLS = 24

const BARS: { key: 'bass' | 'mid' | 'high' | 'level' | 'beat'; label: string; color: TermColor }[] =
  [
    { key: 'bass', label: 'Bass', color: 'red' },
    { key: 'mid', label: 'Mid', color: 'yellow' },
    { key: 'high', label: 'High', color: 'cyan' },
    { key: 'level', label: 'Level', color: 'white' },
    { key: 'beat', label: 'Beat', color: 'magenta' }
  ]

export function AudioPanel(): React.JSX.Element {
  const audio = usePanel((s) => s.audio)
  const status = usePanel((s) => s.app!.audio)
  const loopback = status.loopback
  const noMonitor =
    status.devices.length > 0 && !status.devices.some((d) => /monitor|loopback/i.test(d.label))

  return (
    <Section title="Audio" index={4}>
      {/* Paski ASCII: pełne komórki w kolorze pasma, reszta tym samym kolorem przez znak ░. */}
      <div className="space-y-1 font-mono text-meta" role="group" aria-label="Poziomy audio">
        {BARS.map((b) => {
          const value = audio[b.key]
          const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
          return (
            <div
              key={b.key}
              className="flex items-center gap-2 whitespace-nowrap"
              title={`${b.label}: ${pct}%`}
            >
              <span className="w-12 flex-none uppercase">{b.label}</span>
              {b.key === 'beat' ? (
                <span
                  aria-hidden
                  className={`h-3 w-3 flex-none border border-current ${value > 0.5 ? 'bg-current' : ''}`}
                  style={{ color: termVar(b.color) }}
                />
              ) : null}
              {/* Kolor pasma tylko na pasku (grafika); etykieta i liczba w term-white. */}
              <span
                aria-hidden
                className="min-w-0 flex-1 overflow-hidden"
                style={{ color: termVar(b.color) }}
              >
                {asciiBar(value, b.key === 'beat' ? CELLS - 3 : CELLS)}
              </span>
              <span className="w-8 flex-none text-right tabular-nums">{pct}</span>
            </div>
          )
        })}
      </div>
      <label className="mt-4 block">
        <span className="font-pixel uppercase">Wejście</span>
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
      <div className="mt-1 font-mono text-meta text-muted">
        AKTYWNE / {status.activeLabel ?? '–'}
      </div>
      {status.error && <div className="mt-1 text-danger">{status.error}</div>}
      {loopback.state !== 'unavailable' && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="font-pixel uppercase">Loopback</span>
            <Tag className={loopback.state === 'on' ? 'text-term-green' : 'text-muted'}>
              {loopback.state === 'on' ? 'on' : 'off'}
            </Tag>
          </span>
          <Button
            title="Tworzy wirtualne wejście z monitora bieżącego domyślnego wyjścia (pactl)"
            onClick={createLoopback}
          >
            {loopback.state === 'on' ? 'odtwórz' : 'utwórz'}
          </Button>
        </div>
      )}
      {loopback.error && <div className="mt-1 text-danger">{loopback.error}</div>}
      {noMonitor && loopback.state !== 'on' && (
        <details className="mt-3 text-muted">
          <summary className="link tap cursor-pointer text-fg">
            Nie widać dźwięku z systemu?
          </summary>
          <p className="mt-2">Utwórz wirtualne wejście z monitora domyślnego wyjścia:</p>
          <pre className="mt-2 overflow-x-auto border-l border-dotted py-1 pl-3 font-mono text-meta text-fg">
            {`pactl load-module module-remap-source \\
  master=$(pactl get-default-sink).monitor \\
  source_name=loopback \\
  source_properties=device.description=Loopback`}
          </pre>
          <p className="mt-2">
            Albo w pavucontrol {'->'} Nagrywanie przełącz Visualizer na „Monitor of …”.
          </p>
        </details>
      )}
    </Section>
  )
}

export function OutputPanel({ collapsible = false }: { collapsible?: boolean }): React.JSX.Element {
  const output = usePanel((s) => s.app!.output)
  const [displayId, setDisplayId] = useState<number | null>(null)
  const chosen = output.displays.some((d) => d.id === displayId) ? displayId : null

  return (
    <Section title="Wyjście" index={5} collapsible={collapsible}>
      <label className="block">
        <span className="font-pixel uppercase">Ekran</span>
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setFullscreen(true, chosen)}>
          Pełny ekran
        </Button>
        <Button disabled={!output.fullscreen} onClick={() => setFullscreen(false, null)}>
          Okno
        </Button>
        <span className="ml-auto font-mono text-meta text-muted uppercase">
          {output.fullscreen ? 'pełny ekran' : 'w oknie'}
        </span>
      </div>
    </Section>
  )
}

export function ProjectsPanel({
  collapsible = false
}: {
  collapsible?: boolean
}): React.JSX.Element {
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
      index={6}
      collapsible={collapsible}
      actions={
        <Button
          variant="link"
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
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const n = cleanName(name)
          if (n) void run(() => postJson<ProjectInfo[]>('/api/projects', { name: n }))
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="font-pixel text-muted uppercase">Nazwa projektu</span>
          <input
            className="field mt-1 block w-full"
            placeholder="np. koncert"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" className="min-h-8">
          Zapisz
        </Button>
      </form>
      {error && <div className="mt-2 text-danger">{error}</div>}
      <ul className="rows mt-3">
        {projects.map((p) => (
          <li key={p.name} className="inv-hover flex items-center gap-1 py-1 pl-1">
            <span className="min-w-0 flex-1 truncate" title={new Date(p.savedAt).toLocaleString()}>
              {p.name}
            </span>
            <Button
              variant="link"
              onClick={() =>
                void run(() =>
                  api(`/api/projects/${encodeURIComponent(p.name)}/load`, { method: 'POST' })
                )
              }
            >
              wczytaj
            </Button>
            <a
              className="btn btn-link"
              title="Pobierz .json"
              href={url(`/api/projects/${encodeURIComponent(p.name)}`)}
              download={`${p.name}.json`}
            >
              ↓
            </a>
            <ConfirmButton
              title="Usuń projekt"
              onConfirm={() =>
                void run(() =>
                  api<ProjectInfo[]>(`/api/projects/${encodeURIComponent(p.name)}`, {
                    method: 'DELETE'
                  })
                )
              }
            >
              ×
            </ConfirmButton>
          </li>
        ))}
      </ul>
      {projects.length === 0 && (
        <div className="mt-3">
          <AsciiBox>Brak zapisanych projektów.</AsciiBox>
        </div>
      )}
    </Section>
  )
}

export function TemplatesPanel({
  collapsible = false
}: {
  collapsible?: boolean
}): React.JSX.Element {
  return (
    <Section title="Szablony" index={3} collapsible={collapsible}>
      <div className="rows">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.description}
            className="inv-hover block w-full px-2 py-2 text-left"
            onClick={() => commitGraph(structuredClone(t.graph))}
          >
            <div className="text-fg">{t.name}</div>
            <div className="mt-1 font-mono text-meta text-muted">{t.description}</div>
          </button>
        ))}
      </div>
    </Section>
  )
}
