// Serwer testowany przez fastify.inject / injectWS – bez otwierania portu.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { existsSync } from 'fs'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { defaultGraph } from '@shared/graph'
import type { ServerMessage } from '@shared/types'
import type { Config } from './config'
import { Library } from './library'
import { Projects } from './projects'
import { ControlServer, type ServerDeps } from './server'
import { AppStore } from './store'

const TOKEN = 't'.repeat(24)
const MEDIA_KEY = 'k'.repeat(32)
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

let root: string
let deps: ServerDeps
let server: ControlServer
let app: FastifyInstance

async function setup(patch: Partial<ServerDeps> = {}, config: Partial<Config> = {}): Promise<void> {
  const library = new Library(join(root, 'videos'), join(root, 'data'))
  await library.init()
  const projects = new Projects(join(root, 'projects'))
  await projects.init()
  const store = new AppStore(join(root, 'state.json'), {
    port: 4000,
    localUrl: 'http://127.0.0.1:4000',
    panelUrl: 'http://127.0.0.1:4000/',
    lan: false,
    lanUrls: []
  })
  deps = {
    config: {
      port: 4000,
      libraryDir: library.dir,
      lan: false,
      token: TOKEN,
      openPanelOnStart: false,
      autoLoopback: false,
      ...config
    },
    store,
    library,
    projects,
    panelDir: join(root, 'no-panel'),
    devPanelUrl: null,
    mediaKey: MEDIA_KEY,
    onClientMessage: vi.fn(),
    onLibraryChanged: async () => store.setLibrary(await library.scan()),
    capturePreview: vi.fn(async () => null),
    ...patch
  }
  server = new ControlServer(deps)
  app = await server.build()
  await app.ready()
}

async function addVideo(name = 'clip.mp4', content = '0123456789'): Promise<string> {
  await writeFile(join(deps.library.dir, name), content)
  await deps.onLibraryChanged()
  return deps.library.list().find((v) => v.name === name)!.id
}

function multipart(
  filename: string,
  data: string
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----vzboundary'
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        'Content-Type: application/octet-stream\r\n\r\n'
    ),
    Buffer.from(data),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ])
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vz-server-'))
  await setup()
})

afterEach(async () => {
  await app.close()
  await rm(root, { recursive: true, force: true })
})

describe('zabezpieczenia', () => {
  it('przepuszcza localhost i 127.0.0.1', async () => {
    expect((await app.inject({ url: '/api/state' })).statusCode).toBe(200)
    const res = await app.inject({ url: '/api/state', headers: { host: '127.0.0.1:4000' } })
    expect(res.statusCode).toBe(200)
  })

  it('blokuje obcy nagłówek Host (DNS rebinding)', async () => {
    const res = await app.inject({ url: '/api/state', headers: { host: 'evil.example:4000' } })
    expect(res.statusCode).toBe(403)
  })

  it('blokuje zmiany z obcego Origin (CSRF), ale nie odczyty', async () => {
    const evil = { origin: 'http://evil.example' }
    const post = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: evil,
      payload: { name: 'x' }
    })
    expect(post.statusCode).toBe(403)
    expect((await app.inject({ url: '/api/state', headers: evil })).statusCode).toBe(200)
  })

  it('przepuszcza ten sam origin i origin panelu dev', async () => {
    await app.close()
    await setup({ devPanelUrl: 'http://127.0.0.1:5174' })
    for (const origin of ['http://localhost:80', 'http://127.0.0.1:5174']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { origin },
        payload: { name: 'ok' }
      })
      expect(res.statusCode, origin).toBe(200)
    }
  })

  it('spoza loopbacka: 401 bez LAN, z LAN wymaga poprawnego tokenu', async () => {
    const remote = { remoteAddress: '192.168.1.20', headers: { host: '192.168.1.10:4000' } }
    expect((await app.inject({ url: `/api/state?token=${TOKEN}`, ...remote })).statusCode).toBe(401)

    await app.close()
    await setup({}, { lan: true })
    expect((await app.inject({ url: '/api/state', ...remote })).statusCode).toBe(401)
    expect((await app.inject({ url: '/api/state?token=zly', ...remote })).statusCode).toBe(401)
    expect((await app.inject({ url: `/api/state?token=${TOKEN}`, ...remote })).statusCode).toBe(200)
  })
})

describe('biblioteka i media', () => {
  it('upload zapisuje plik i odświeża stan', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/library',
      ...multipart('nowy.mp4', 'abc')
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ saved: ['nowy.mp4'] })
    expect(deps.store.get().library.map((v) => v.name)).toEqual(['nowy.mp4'])
    expect(deps.store.get().activeId).toBe(deps.store.get().library[0].id)
  })

  it('upload odrzuca zły format kodem 415', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/library',
      ...multipart('x.exe', 'abc')
    })
    expect(res.statusCode).toBe(415)
    expect(res.json().error).toMatch(/Nieobsługiwany format/)
  })

  it('GET /api/library zwraca listę', async () => {
    const id = await addVideo()
    const res = await app.inject({ url: '/api/library' })
    expect(res.json()).toEqual([expect.objectContaining({ id, name: 'clip.mp4', size: 10 })])
  })

  it('/media obsługuje Range', async () => {
    const id = await addVideo()
    const res = await app.inject({ url: `/media/${id}`, headers: { range: 'bytes=2-5' } })
    expect(res.statusCode).toBe(206)
    expect(res.headers['content-range']).toBe('bytes 2-5/10')
    expect(res.body).toBe('2345')
    expect(res.headers['content-type']).toBe('video/mp4')
  })

  it('/media daje CORS tylko z kluczem okna wizualizacji', async () => {
    const id = await addVideo()
    expect(
      (await app.inject({ url: `/media/${id}` })).headers['access-control-allow-origin']
    ).toBeUndefined()
    expect(
      (await app.inject({ url: `/media/${id}?k=zly` })).headers['access-control-allow-origin']
    ).toBeUndefined()
    const ok = await app.inject({ url: `/media/${id}?k=${MEDIA_KEY}` })
    expect(ok.headers['access-control-allow-origin']).toBe('*')
  })

  it('/media zwraca 404 dla nieznanego id', async () => {
    expect((await app.inject({ url: '/media/nope' })).statusCode).toBe(404)
  })

  it('DELETE usuwa wideo', async () => {
    const id = await addVideo()
    expect((await app.inject({ method: 'DELETE', url: `/api/library/${id}` })).statusCode).toBe(204)
    expect(existsSync(join(deps.library.dir, 'clip.mp4'))).toBe(false)
    expect(deps.store.get().library).toEqual([])
    expect((await app.inject({ method: 'DELETE', url: `/api/library/${id}` })).statusCode).toBe(404)
  })

  it('meta zapisuje długość i miniaturę JPEG, ignoruje inne obrazy', async () => {
    const id = await addVideo()
    const png = `data:image/png;base64,${Buffer.from('png').toString('base64')}`
    await app.inject({ method: 'POST', url: `/api/library/${id}/meta`, payload: { thumb: png } })
    expect((await app.inject({ url: `/api/library/${id}/thumb` })).statusCode).toBe(404)

    const jpeg = `data:image/jpeg;base64,${JPEG.toString('base64')}`
    const res = await app.inject({
      method: 'POST',
      url: `/api/library/${id}/meta`,
      payload: { duration: 42, thumb: jpeg }
    })
    expect(res.statusCode).toBe(204)
    const item = deps.store.get().library[0]
    expect(item.duration).toBe(42)
    const thumb = await app.inject({ url: item.thumb! })
    expect(thumb.statusCode).toBe(200)
    expect(thumb.rawPayload.equals(JPEG)).toBe(true)
  })

  it('meta odrzuca ujemną długość i nieznane id', async () => {
    const id = await addVideo()
    await app.inject({ method: 'POST', url: `/api/library/${id}/meta`, payload: { duration: -1 } })
    expect(deps.store.get().library[0].duration).toBeNull()
    const res = await app.inject({ method: 'POST', url: '/api/library/nope/meta', payload: {} })
    expect(res.statusCode).toBe(404)
  })
})

describe('projekty', () => {
  it('zapis, lista, pobranie, wczytanie i usunięcie', async () => {
    const save = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Set 1' }
    })
    expect(save.json()).toEqual([expect.objectContaining({ name: 'Set 1' })])

    const download = await app.inject({ url: '/api/projects/Set%201' })
    expect(download.headers['content-disposition']).toContain("filename*=UTF-8''Set%201.json")
    expect(download.json()).toEqual(defaultGraph())

    deps.store.setGraph({ nodes: [], edges: [] })
    const load = await app.inject({ method: 'POST', url: '/api/projects/Set%201/load' })
    expect(load.statusCode).toBe(204)
    expect(deps.store.get().graph).toEqual(defaultGraph())

    const del = await app.inject({ method: 'DELETE', url: '/api/projects/Set%201' })
    expect(del.json()).toEqual([])
  })

  it('import sanityzuje przesłany graf', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'import', graph: { nodes: [{ id: 'z', type: 'Hack' }], edges: [] } }
    })
    const res = await app.inject({ url: '/api/projects/import' })
    expect(res.json().nodes.map((n: { type: string }) => n.type)).toEqual(['Output'])
  })

  it('odrzuca złe nazwy', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: '../x' }
    })
    expect(bad.statusCode).toBe(400)
    expect((await app.inject({ url: '/api/projects/a.b' })).statusCode).toBe(400)
  })

  it('brak pliku → błąd zamiast wywrotki', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/projects/brak/load' })
    expect(res.statusCode).toBe(500)
    expect(res.json().error).toBeTruthy()
  })
})

describe('podgląd i strona główna', () => {
  it('podgląd: 204 bez klatki, JPEG gdy jest', async () => {
    expect((await app.inject({ url: '/api/preview.jpg' })).statusCode).toBe(204)
    vi.mocked(deps.capturePreview).mockResolvedValueOnce(JPEG)
    const res = await app.inject({ url: '/api/preview.jpg' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('bez zbudowanego panelu pokazuje podpowiedź', async () => {
    const res = await app.inject({ url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('npm run build:panel')
  })

  it('serwuje zbudowany panel', async () => {
    await app.close()
    const panelDir = join(root, 'panel')
    await rm(panelDir, { recursive: true, force: true })
    await import('fs/promises').then((fs) => fs.mkdir(panelDir))
    await writeFile(join(panelDir, 'index.html'), '<h1>panel</h1>')
    await setup({ panelDir })
    expect((await app.inject({ url: '/' })).body).toBe('<h1>panel</h1>')
  })
})

describe('WebSocket', () => {
  // injectWS nie ma prawdziwego gniazda – podajemy adres loopback i Host jak przeglądarka.
  const local = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:4000' }
  } as never

  function collect(ws: { on(e: 'message', cb: (d: Buffer) => void): void }): ServerMessage[] {
    const messages: ServerMessage[] = []
    ws.on('message', (d) => messages.push(JSON.parse(d.toString())))
    return messages
  }

  it('wysyła pełny stan po połączeniu', async () => {
    const messages: ServerMessage[] = []
    const ws = await app.injectWS('/ws', local, {
      onInit: (s) => s.on('message', (d) => messages.push(JSON.parse(d.toString())))
    })
    await vi.waitFor(() => expect(messages[0]?.type).toBe('state'))
    ws.terminate()
  })

  it('odrzuca połączenie bez znanego adresu i tokenu', async () => {
    await expect(app.injectWS('/ws')).rejects.toThrow(/401/)
  })

  it('odrzuca obcy Origin', async () => {
    const evil = {
      socket: { remoteAddress: '127.0.0.1' },
      headers: { host: 'localhost:4000', origin: 'http://evil.example' }
    } as never
    await expect(app.injectWS('/ws', evil)).rejects.toThrow(/403/)
  })

  it('przekazuje poprawne wiadomości, a na złe odpowiada błędem', async () => {
    const ws = await app.injectWS('/ws', local)
    const messages = collect(ws)
    ws.send(JSON.stringify({ type: 'playback:select', id: null }))
    ws.send('śmieci')
    await vi.waitFor(() => {
      expect(deps.onClientMessage).toHaveBeenCalledWith({ type: 'playback:select', id: null })
      expect(messages.some((m) => m.type === 'error')).toBe(true)
    })
    expect(deps.onClientMessage).toHaveBeenCalledTimes(1)
    ws.terminate()
  })

  it('broadcast dociera do klientów, a po rozłączeniu nie', async () => {
    const ws = await app.injectWS('/ws', local)
    const messages = collect(ws)
    server.broadcast({ type: 'audio', bass: 1, mid: 0, high: 0, level: 0, beat: 0 })
    await vi.waitFor(() => expect(messages.some((m) => m.type === 'audio')).toBe(true))
    ws.close()
    await vi.waitFor(() => expect(ws.readyState).toBe(ws.CLOSED))
    expect(() => server.broadcast({ type: 'error', message: 'x' })).not.toThrow()
  })
})

describe('start / stop / restart', () => {
  // Wysoki port, żeby nie trafić w działającą aplikację (4000).
  const base = 47000 + Math.floor(Math.random() * 1000)

  it('nasłuchuje na wolnym porcie i podaje adresy', async () => {
    await app.close()
    await setup({}, { port: base })
    const info = await server.start()
    expect(info).toMatchObject({
      port: base,
      localUrl: `http://127.0.0.1:${base}`,
      panelUrl: `http://127.0.0.1:${base}/`,
      lan: false,
      lanUrls: []
    })
    const res = await fetch(`${info.localUrl}/api/state`)
    expect(res.status).toBe(200)
    await server.stop()
  })

  it('zajęty port → bierze następny wolny', async () => {
    const { createServer } = await import('net')
    const blocker = createServer()
    await new Promise<void>((r) => blocker.listen(base + 1, '127.0.0.1', r))
    await app.close()
    await setup({}, { port: base + 1 })
    try {
      const info = await server.start()
      expect(info.port).toBeGreaterThan(base + 1)
      await server.stop()
    } finally {
      blocker.close()
    }
  })

  it('restart z LAN podaje adresy z tokenem; panel dev ma własny adres', async () => {
    await app.close()
    await setup({ devPanelUrl: 'http://127.0.0.1:5174' }, { port: base + 10 })
    await server.start()
    deps.config.lan = true
    const info = await server.restart()
    expect(info.lan).toBe(true)
    expect(info.panelUrl).toBe('http://127.0.0.1:5174')
    for (const u of info.lanUrls) expect(u).toMatch(new RegExp(`:${info.port}/\\?token=${TOKEN}$`))
    await server.stop()
  })
})
