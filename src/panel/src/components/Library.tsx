// Biblioteka wideo: upload (przycisk lub przeciągnięcie), lista, wybór aktywnego.

import { useEffect, useRef, useState } from 'react'
import type { VideoItem } from '@shared/types'
import { api, postJson, uploadFiles, url } from '../api'
import { selectVideo, usePanel } from '../store'
import { Button, Section } from './ui'

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

export function Library(): React.JSX.Element {
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

  return (
    <Section
      title={`Biblioteka (${library.length})`}
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
        className={`space-y-1 rounded ${dragOver ? 'outline-2 outline-dashed outline-violet-500' : ''}`}
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
          <div className="h-1.5 overflow-hidden rounded bg-neutral-800">
            <div
              className="h-full bg-violet-500"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
        {error && <div className="text-xs text-red-400">{error}</div>}
        {library.length === 0 && (
          <div className="rounded border border-dashed border-neutral-700 p-4 text-center text-xs text-neutral-500">
            Przeciągnij tu pliki wideo (najlepiej H.264 1080p) albo kliknij „Dodaj”.
          </div>
        )}
        {library.map((item) => (
          <div
            key={item.id}
            className={`group flex cursor-pointer items-center gap-2 rounded p-1 ${
              item.id === activeId
                ? 'bg-violet-900/40 ring-1 ring-violet-500'
                : 'hover:bg-neutral-800'
            }`}
            onClick={() => selectVideo(item.id)}
          >
            <div className="h-10 w-16 shrink-0 overflow-hidden rounded bg-neutral-800">
              {item.thumb && (
                <img src={url(item.thumb)} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-neutral-100" title={item.name}>
                {item.name}
              </div>
              <div className="text-[10px] text-neutral-500">
                {formatDuration(item.duration)} · {formatSize(item.size)}
              </div>
            </div>
            <Button
              variant="danger"
              className="opacity-0 group-hover:opacity-100"
              title="Usuń z dysku"
              onClick={(e) => {
                e.stopPropagation()
                void remove(item)
              }}
            >
              ✕
            </Button>
          </div>
        ))}
      </div>
    </Section>
  )
}
