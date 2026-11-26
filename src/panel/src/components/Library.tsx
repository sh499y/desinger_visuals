// Biblioteka wideo: upload (przycisk lub przeciągnięcie), lista, wybór aktywnego.

import { useEffect, useRef, useState } from 'react'
import type { VideoItem } from '@shared/types'
import { api, postJson, uploadFiles, url } from '../api'
import { asciiBar } from '../ascii'
import { selectVideo, timelineAdd, usePanel } from '../store'
import { Queue } from './Queue'
import { AsciiBox, Button, Section, Tag } from './ui'

const attempted = new Set<string>()

function waitFor(el: HTMLVideoElement, event: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    el.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true })
    el.addEventListener('error', () => (clearTimeout(timer), reject(new Error('błąd wideo'))), {
      once: true
    })
  })
}

/** Miniatura i długość liczone w przeglądarce, potem zapisywane na serwerze. */
async function generateMeta(item: VideoItem): Promise<void> {
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'auto'
  video.src = url(`/media/${item.id}`)
  try {
    await waitFor(video, 'loadedmetadata', 20000)
    const duration = Number.isFinite(video.duration) ? video.duration : null
    video.currentTime = Math.min(1, (duration ?? 3) / 3)
    await waitFor(video, 'seeked', 20000)
    const w = 320
    const h = Math.round((w * video.videoHeight) / Math.max(1, video.videoWidth))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
    await postJson(`/api/library/${item.id}/meta`, {
      duration,
      thumb: canvas.toDataURL('image/jpeg', 0.75)
    })
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

function useThumbnails(library: VideoItem[]): void {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const item of library) {
        if (cancelled) return
        if ((item.thumb && item.duration !== null) || attempted.has(item.id)) continue
        attempted.add(item.id)
        await generateMeta(item).catch((err) => console.warn('Miniatura', item.name, err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [library])
}

const formatDuration = (s: number | null): string =>
  s === null ? '–' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const formatSize = (b: number): string =>
  b > 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`

/** `collapsible`: zwinięta sekcja pływająca nad grafem (aktywne wideo w podsumowaniu). */
export function Library({ collapsible = false }: { collapsible?: boolean }): React.JSX.Element {
  const library = usePanel((s) => s.app?.library ?? [])
  const activeId = usePanel((s) => s.app?.activeId ?? null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useThumbnails(library)

  const upload = async (files: File[]): Promise<void> => {
    if (files.length === 0) return
    setError(null)
    setProgress(0)
    try {
      await uploadFiles(files, setProgress)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setProgress(null)
    }
  }

  const remove = async (item: VideoItem): Promise<void> => {
    if (!confirm(`Usunąć „${item.name}” z dysku?`)) return
    await api(`/api/library/${item.id}`, { method: 'DELETE' }).catch((err) => setError(String(err)))
  }

  const active = library.find((v) => v.id === activeId)
  const summary = (
    <div className="flex min-w-0 items-center gap-2">
      <div className="h-5 w-8 shrink-0 overflow-hidden border bg-black">
        {active?.thumb && (
          <img src={url(active.thumb)} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <span className={`truncate ${active ? 'text-fg' : 'text-muted'}`} title={active?.name}>
        {active?.name ?? 'Brak aktywnego wideo'}
      </span>
    </div>
  )

  return (
    <Section
      title="Biblioteka"
      index={1}
      meta={`(${library.length})`}
      collapsible={collapsible}
      summary={summary}
      actions={
        <Button
          variant="primary"
          disabled={progress !== null}
          onClick={() => input.current?.click()}
        >
          + Dodaj
        </Button>
      }
    >
      <Queue />
      <input
        ref={input}
        type="file"
        accept="video/*,.mkv"
        multiple
        hidden
        onChange={(e) => {
          void upload(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <div
        className={dragOver ? 'outline-1 outline-offset-4 outline-dotted outline-term-white' : ''}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void upload(Array.from(e.dataTransfer.files))
        }}
      >
        {progress !== null && (
          <div
            className="mb-2 flex items-center gap-2 font-mono text-meta whitespace-nowrap"
            role="progressbar"
            aria-label="Wysyłanie plików"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span className="min-w-0 flex-1 overflow-hidden">[{asciiBar(progress, 16)}]</span>
            <span className="w-12 flex-none text-right tabular-nums">
              {Math.round(progress * 100)}%
            </span>
          </div>
        )}
        {error && <div className="mb-2 text-danger">{error}</div>}
        {library.length === 0 && (
          <AsciiBox>
            Przeciągnij tu pliki wideo (najlepiej H.264 1080p) albo kliknij „Dodaj”.
          </AsciiBox>
        )}
        <div className="rows">
          {library.map((item) => {
            const active = item.id === activeId
            return (
              <div
                key={item.id}
                className={`reveal-on-hover flex min-h-12 cursor-pointer items-center gap-2 p-2 ${
                  active ? 'inv' : 'inv-hover'
                }`}
                aria-current={active || undefined}
                onClick={() => selectVideo(item.id)}
              >
                <div className="h-10 w-16 shrink-0 overflow-hidden border bg-black">
                  {item.thumb && (
                    <img src={url(item.thumb)} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {active && <span aria-hidden className="h-2 w-2 flex-none bg-current" />}
                    <span className="truncate text-ui leading-[1.4] text-fg" title={item.name}>
                      {item.name}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-meta text-muted">
                    <span className="truncate">
                      {formatDuration(item.duration)} / {formatSize(item.size)}
                    </span>
                    {active && <Tag className="bg-black text-term-green">live</Tag>}
                  </div>
                </div>
                <Button
                  variant="link"
                  className="reveal"
                  title="Dodaj do kolejki"
                  onClick={(e) => {
                    e.stopPropagation()
                    timelineAdd(item.id)
                  }}
                >
                  + kolejka
                </Button>
                <Button
                  variant="link"
                  className="reveal btn-danger"
                  title="Usuń z dysku"
                  onClick={(e) => {
                    e.stopPropagation()
                    void remove(item)
                  }}
                >
                  ×
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    </Section>
  )
}
