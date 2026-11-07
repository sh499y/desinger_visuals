// Biblioteka wideo: folder na dysku + cache metadanych (długość, miniatury).

import { createHash } from 'crypto'
import { createWriteStream, existsSync, watch, type FSWatcher } from 'fs'
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { basename, extname, join } from 'path'
import { pipeline } from 'stream/promises'
import type { Readable } from 'stream'
import type { VideoItem } from '@shared/types'

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.ogv'])

interface Meta {
  duration?: number
  thumbAt?: number
}

const idOf = (name: string): string => createHash('sha1').update(name).digest('hex').slice(0, 12)

export function safeFileName(name: string): string {
  const base = basename(name)
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} ._()-]/gu, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120)
  return base || 'video'
}

export class Library {
  private files = new Map<string, string>()
  private meta: Record<string, Meta> = {}
  private items: VideoItem[] = []
  private watcher: FSWatcher | null = null
  private readonly thumbsDir: string
  private readonly metaPath: string

  constructor(
    readonly dir: string,
    dataDir: string
  ) {
    this.thumbsDir = join(dataDir, 'thumbs')
    this.metaPath = join(dataDir, 'library-meta.json')
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    await mkdir(this.thumbsDir, { recursive: true })
    try {
      this.meta = JSON.parse(await readFile(this.metaPath, 'utf8'))
    } catch {
      this.meta = {}
    }
    await this.scan()
  }

  list(): VideoItem[] {
    return this.items
  }

  has(id: string): boolean {
    return this.files.has(id)
  }

  /** Nazwa pliku w folderze biblioteki. */
  fileOf(id: string): string | null {
    return this.files.get(id) ?? null
  }

  thumbFile(id: string): string {
    return `${id}.jpg`
  }

  get thumbsRoot(): string {
    return this.thumbsDir
  }

  async scan(): Promise<VideoItem[]> {
    const entries = await readdir(this.dir, { withFileTypes: true })
    const files = new Map<string, string>()
    const items: VideoItem[] = []
    for (const e of entries) {
      if (!e.isFile() || !VIDEO_EXTENSIONS.has(extname(e.name).toLowerCase())) continue
      const id = idOf(e.name)
      const size = (await stat(join(this.dir, e.name))).size
      const meta = this.meta[id] ?? {}
      files.set(id, e.name)
      items.push({
        id,
        name: e.name,
        size,
        duration: meta.duration ?? null,
        thumb: meta.thumbAt ? `/api/library/${id}/thumb?v=${meta.thumbAt}` : null
      })
    }
    items.sort((a, b) => a.name.localeCompare(b.name))
    this.files = files
    this.items = items
    return items
  }

  /** Obserwuje folder, żeby pliki dodane spoza panelu też się pojawiały. */
  watch(onChange: () => void): void {
    let timer: NodeJS.Timeout | null = null
    try {
      this.watcher = watch(this.dir, () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(onChange, 400)
      })
    } catch {
      // np. brak inotify; lista odświeży się przy uploadzie
    }
  }

  close(): void {
    this.watcher?.close()
  }

  async save(name: string, data: Readable): Promise<string> {
    const clean = safeFileName(name)
    const ext = extname(clean).toLowerCase()
    if (!VIDEO_EXTENSIONS.has(ext))
      throw new Error(`Nieobsługiwany format: ${ext || 'brak rozszerzenia'}`)
    const stem = clean.slice(0, clean.length - ext.length)
    let target = clean
    for (let i = 1; existsSync(join(this.dir, target)); i++) target = `${stem} (${i})${ext}`
    const path = join(this.dir, target)
    try {
      await pipeline(data, createWriteStream(path, { flags: 'wx' }))
    } catch (err) {
      await unlink(path).catch(() => {})
      throw err
    }
    return target
  }

  async remove(id: string): Promise<void> {
    const name = this.files.get(id)
    if (!name) return
    await unlink(join(this.dir, name))
    await unlink(join(this.thumbsDir, this.thumbFile(id))).catch(() => {})
    delete this.meta[id]
    await this.saveMeta()
  }

  async setMeta(id: string, duration: number | null, thumbJpeg: Buffer | null): Promise<void> {
    if (!this.files.has(id)) return
    const meta = (this.meta[id] ??= {})
    if (duration !== null) meta.duration = duration
    if (thumbJpeg) {
      await writeFile(join(this.thumbsDir, this.thumbFile(id)), thumbJpeg)
      meta.thumbAt = Date.now()
    }
    await this.saveMeta()
  }

  private async saveMeta(): Promise<void> {
    await writeFile(this.metaPath, JSON.stringify(this.meta))
  }
}
