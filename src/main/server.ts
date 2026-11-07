// Backend: HTTP + WebSocket na własnym porcie (domyślnie 127.0.0.1:4000).
// Serwuje panel sterowania, API biblioteki i projektów oraz pliki wideo z obsługą Range.

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import websocket, { type WebSocket } from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import multipart from '@fastify/multipart'
import { timingSafeEqual } from 'crypto'
import { existsSync } from 'fs'
import { createServer } from 'net'
import { networkInterfaces } from 'os'
import { join } from 'path'
import type { ClientMessage, ServerInfo, ServerMessage } from '@shared/types'
import type { Config } from './config'
import type { Library } from './library'
import { isProjectName, type Projects } from './projects'
import { parseClientMessage } from './protocol'
import type { AppStore } from './store'
import { sanitizeGraph } from '@shared/graph'

export interface ServerDeps {
  config: Config
  store: AppStore
  library: Library
  projects: Projects
  /** Zbudowany panel (out/panel). */
  panelDir: string
  /** Adres Vite z panelem w trybie dev, np. http://127.0.0.1:5174. */
  devPanelUrl: string | null
  /** Klucz okna wizualizacji: /media z tym kluczem dostaje nagłówek CORS. */
  mediaKey: string
  onClientMessage(msg: ClientMessage): void
  onLibraryChanged(): Promise<void>
  capturePreview(): Promise<Buffer | null>
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const MAX_UPLOAD = 20 * 1024 ** 3

const isLoopback = (ip: string | undefined): boolean =>
  ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function lanAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address)
  }
  return out
}

function portFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => probe.close(() => resolve(true)))
      .listen(port, host)
  })
}

async function findFreePort(start: number, host: string): Promise<number> {
  for (let p = start; p < start + 50 && p < 65536; p++) if (await portFree(p, host)) return p
  throw new Error(`Brak wolnego portu od ${start}`)
}

const param = (req: FastifyRequest, key: string): string =>
  String((req.params as Record<string, string>)[key] ?? '')

export class ControlServer {
  private app: FastifyInstance | null = null
  private sockets = new Set<WebSocket>()
  info: ServerInfo | null = null

  constructor(private readonly deps: ServerDeps) {}

  broadcast(msg: ServerMessage): void {
    if (this.sockets.size === 0) return
    const data = JSON.stringify(msg)
    for (const s of this.sockets) if (s.readyState === s.OPEN) s.send(data)
  }

  async start(): Promise<ServerInfo> {
    const { config, devPanelUrl } = this.deps
    const host = config.lan ? '0.0.0.0' : '127.0.0.1'
    const port = await findFreePort(config.port, host)
    const app = await this.build()
    await app.listen({ host, port })
    this.app = app

    const localUrl = `http://127.0.0.1:${port}`
    this.info = {
      port,
      localUrl,
      panelUrl: devPanelUrl ?? `${localUrl}/`,
      lan: config.lan,
      lanUrls: config.lan
        ? lanAddresses().map((ip) => `http://${ip}:${port}/?token=${config.token}`)
        : []
    }
    return this.info
  }

  async stop(): Promise<void> {
    const app = this.app
    this.app = null
    for (const s of this.sockets) s.close(1001, 'restart')
    this.sockets.clear()
    await app?.close()
  }

  async restart(): Promise<ServerInfo> {
    await this.stop()
    return this.start()
  }

  private async build(): Promise<FastifyInstance> {
    const { config, store, library, projects, panelDir, devPanelUrl, mediaKey } = this.deps
    const app = Fastify({ logger: false, bodyLimit: 8 * 1024 * 1024 })

    const devOrigins = new Set<string>()
    if (devPanelUrl) {
      const u = new URL(devPanelUrl)
      devOrigins.add(`http://127.0.0.1:${u.port}`)
      devOrigins.add(`http://localhost:${u.port}`)
    }

    // Ochrona: DNS rebinding (nagłówek Host), CSRF (Origin) i token dla dostępu z sieci.
    app.addHook('onRequest', async (req, reply) => {
      const host = req.headers.host ?? ''
      const hostname = host
        .replace(/:\d+$/, '')
        .replace(/^\[(.*)\]$/, '$1')
        .toLowerCase()
      if (isLoopback(req.socket.remoteAddress)) {
        if (!LOOPBACK_HOSTS.has(hostname))
          return reply.code(403).send({ error: 'Niedozwolony host' })
      } else {
        const token = (req.query as Record<string, unknown> | undefined)?.token
        if (!config.lan || typeof token !== 'string' || !safeEqual(token, config.token)) {
          return reply.code(401).send({ error: 'Wymagany token' })
        }
      }
      const isWs = req.headers.upgrade?.toLowerCase() === 'websocket'
      const origin = req.headers.origin
      if ((isWs || !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) && origin) {
        let sameHost = false
        try {
          sameHost = new URL(origin).host === host
        } catch {
          // zły Origin
        }
        if (!sameHost && !devOrigins.has(origin)) {
          return reply.code(403).send({ error: 'Niedozwolony origin' })
        }
      }
      return undefined
    })

    app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
      reply
        .code(err.statusCode && err.statusCode >= 400 ? err.statusCode : 500)
        .send({ error: err.message })
    })

    await app.register(websocket)
    await app.register(multipart, { limits: { fileSize: MAX_UPLOAD, files: 20 } })

    const panelBuilt = existsSync(join(panelDir, 'index.html'))
    if (panelBuilt) {
      await app.register(fastifyStatic, { root: panelDir, prefix: '/', index: 'index.html' })
    } else {
      // Tylko reply.sendFile, bez serwowania katalogu.
      await app.register(fastifyStatic, { root: library.dir, serve: false })
      app.get('/', async (_req, reply) => {
        const link = devPanelUrl
          ? `<a href="${devPanelUrl}">${devPanelUrl}</a> (dev)`
          : 'brak – uruchom <code>npm run build:panel</code>'
        return reply.type('text/html; charset=utf-8')
          .send(`<!doctype html><meta charset="utf-8"><title>Visualizer</title>
<body style="font:16px system-ui;background:#111;color:#eee;padding:2rem">
<h1>Visualizer – backend działa</h1><p>Panel: ${link}</p></body>`)
      })
    }

    // --- WebSocket ---
    app.get('/ws', { websocket: true }, (socket) => {
      this.sockets.add(socket)
      socket.send(JSON.stringify(store.stateMessage()))
      socket.on('message', (data) => {
        const msg = parseClientMessage(data.toString())
        if (msg) this.deps.onClientMessage(msg)
        else socket.send(JSON.stringify({ type: 'error', message: 'Nieprawidłowa wiadomość' }))
      })
      socket.on('close', () => this.sockets.delete(socket))
    })

    // --- Stan ---
    app.get('/api/state', async () => store.get())

    // --- Biblioteka ---
    app.get('/api/library', async () => library.list())

    app.post('/api/library', async (req) => {
      const saved: string[] = []
      for await (const part of req.files()) saved.push(await library.save(part.filename, part.file))
      await this.deps.onLibraryChanged()
      return { saved }
    })

    app.delete('/api/library/:id', async (req, reply) => {
      const id = param(req, 'id')
      if (!library.has(id)) return reply.code(404).send({ error: 'Nie ma takiego wideo' })
      await library.remove(id)
      await this.deps.onLibraryChanged()
      return reply.code(204).send()
    })

    app.post('/api/library/:id/meta', async (req, reply) => {
      const id = param(req, 'id')
      if (!library.has(id)) return reply.code(404).send({ error: 'Nie ma takiego wideo' })
      const body = (req.body ?? {}) as { duration?: unknown; thumb?: unknown }
      const duration =
        typeof body.duration === 'number' && Number.isFinite(body.duration) && body.duration >= 0
          ? body.duration
          : null
      let jpeg: Buffer | null = null
      const prefix = 'data:image/jpeg;base64,'
      if (typeof body.thumb === 'string' && body.thumb.startsWith(prefix)) {
        const buf = Buffer.from(body.thumb.slice(prefix.length), 'base64')
        if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) jpeg = buf
      }
      await library.setMeta(id, duration, jpeg)
      await this.deps.onLibraryChanged()
      return reply.code(204).send()
    })

    app.get('/api/library/:id/thumb', async (req, reply) => {
      const id = param(req, 'id')
      const file = library.thumbFile(id)
      if (!library.has(id) || !existsSync(join(library.thumbsRoot, file))) {
        return reply.code(404).send({ error: 'Brak miniatury' })
      }
      return reply
        .header('cache-control', 'max-age=31536000, immutable')
        .sendFile(file, library.thumbsRoot)
    })

    app.get('/media/:id', async (req, reply: FastifyReply) => {
      const name = library.fileOf(param(req, 'id'))
      if (!name) return reply.code(404).send({ error: 'Nie ma takiego wideo' })
      const key = (req.query as Record<string, unknown>).k
      if (typeof key === 'string' && safeEqual(key, mediaKey)) {
        reply.header('access-control-allow-origin', '*')
      }
      return reply.sendFile(name, library.dir)
    })

    // --- Podgląd okna wizualizacji ---
    app.get('/api/preview.jpg', async (_req, reply) => {
      const jpeg = await this.deps.capturePreview()
      if (!jpeg) return reply.code(204).send()
      return reply.type('image/jpeg').header('cache-control', 'no-store').send(jpeg)
    })

    // --- Projekty ---
    const projectName = (req: FastifyRequest, reply: FastifyReply): string | null => {
      const name = param(req, 'name')
      if (isProjectName(name)) return name
      void reply.code(400).send({ error: 'Nieprawidłowa nazwa projektu' })
      return null
    }

    app.get('/api/projects', async () => projects.list())

    app.post('/api/projects', async (req, reply) => {
      const body = (req.body ?? {}) as { name?: unknown; graph?: unknown }
      if (!isProjectName(body.name))
        return reply.code(400).send({ error: 'Nieprawidłowa nazwa projektu' })
      const graph = body.graph === undefined ? store.get().graph : sanitizeGraph(body.graph)
      await projects.save(body.name, graph)
      return projects.list()
    })

    app.get('/api/projects/:name', async (req, reply) => {
      const name = projectName(req, reply)
      if (!name) return reply
      return reply
        .type('application/json')
        .header(
          'content-disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(name)}.json`
        )
        .send(await projects.raw(name))
    })

    app.post('/api/projects/:name/load', async (req, reply) => {
      const name = projectName(req, reply)
      if (!name) return reply
      store.loadGraph(await projects.load(name))
      return reply.code(204).send()
    })

    app.delete('/api/projects/:name', async (req, reply) => {
      const name = projectName(req, reply)
      if (!name) return reply
      await projects.remove(name)
      return projects.list()
    })

    return app
  }
}
