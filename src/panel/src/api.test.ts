// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://192.168.1.10:4000/?token=sekret"}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Api = typeof import('./api')

// API happy-dom do zmiany adresu strony (nie ma go w typach DOM).
const happyDOM = (): { setURL(url: string): void } =>
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM

/** Świeży moduł api.ts dla danego adresu panelu (token czytany przy imporcie). */
async function load(url = 'http://192.168.1.10:4000/?token=sekret'): Promise<Api> {
  vi.resetModules()
  happyDOM().setURL(url)
  return import('./api')
}

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.useRealTimers())

describe('url', () => {
  it('dokleja token z adresu panelu', async () => {
    const { url } = await load()
    expect(url('/api/state')).toBe('/api/state?token=sekret')
    expect(url('/api/preview.jpg?t=1')).toBe('/api/preview.jpg?t=1&token=sekret')
  })

  it('pamięta token po przeładowaniu bez parametru', async () => {
    await load()
    const { url } = await load('http://192.168.1.10:4000/')
    expect(url('/x')).toBe('/x?token=sekret')
  })

  it('bez tokenu adres się nie zmienia', async () => {
    const { url } = await load('http://127.0.0.1:4000/')
    expect(url('/api/state')).toBe('/api/state')
  })
})

describe('api / postJson', () => {
  it('zwraca JSON, a dla 204 undefined', async () => {
    const { api } = await load()
    const fetch = vi.fn(async () => new Response(JSON.stringify([1]), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await api('/api/library')).toEqual([1])
    expect(fetch).toHaveBeenCalledWith('/api/library?token=sekret', undefined)

    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
    expect(await api('/api/x', { method: 'DELETE' })).toBeUndefined()
  })

  it('rzuca komunikatem z serwera albo kodem HTTP', async () => {
    const { api } = await load()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'Nie ma takiego wideo' }), { status: 404 })
        )
        .mockResolvedValueOnce(new Response('<html>', { status: 502 }))
    )
    await expect(api('/a')).rejects.toThrow('Nie ma takiego wideo')
    await expect(api('/b')).rejects.toThrow('HTTP 502')
  })

  it('postJson wysyła JSON', async () => {
    const { postJson } = await load()
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    await postJson('/api/projects', { name: 'x' })
    expect(fetch).toHaveBeenCalledWith('/api/projects?token=sekret', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"name":"x"}'
    })
  })
})

describe('uploadFiles', () => {
  class FakeXHR {
    static last: FakeXHR
    status = 0
    responseText = ''
    upload: {
      onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null
    } = { onprogress: null }
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    method = ''
    url = ''
    body: FormData | null = null
    constructor() {
      FakeXHR.last = this
    }
    open(method: string, url: string): void {
      this.method = method
      this.url = url
    }
    send(body: FormData): void {
      this.body = body
    }
  }

  beforeEach(() => vi.stubGlobal('XMLHttpRequest', FakeXHR))

  it('raportuje postęp i kończy sukcesem', async () => {
    const { uploadFiles } = await load()
    const progress = vi.fn()
    const done = uploadFiles([new File(['abc'], 'a.mp4')], progress)
    const xhr = FakeXHR.last
    expect(xhr.url).toBe('/api/library?token=sekret')
    expect((xhr.body!.get('file') as File).name).toBe('a.mp4')
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 1, total: 4 })
    xhr.status = 200
    xhr.onload!()
    await expect(done).resolves.toBeUndefined()
    expect(progress).toHaveBeenCalledWith(0.25)
  })

  it('zwraca błąd serwera i błąd sieci', async () => {
    const { uploadFiles } = await load()
    const bad = uploadFiles([new File(['x'], 'x.exe')], () => {})
    FakeXHR.last.status = 415
    FakeXHR.last.responseText = JSON.stringify({ error: 'Nieobsługiwany format: .exe' })
    FakeXHR.last.onload!()
    await expect(bad).rejects.toThrow('Nieobsługiwany format')

    const offline = uploadFiles([new File(['x'], 'a.mp4')], () => {})
    FakeXHR.last.onerror!()
    await expect(offline).rejects.toThrow('Błąd sieci')
  })
})

describe('Connection', () => {
  class FakeWS {
    static OPEN = 1
    static instances: FakeWS[] = []
    readyState = 0
    sent: string[] = []
    onopen: (() => void) | null = null
    onmessage: ((e: { data: string }) => void) | null = null
    onclose: (() => void) | null = null
    constructor(readonly url: string) {
      FakeWS.instances.push(this)
    }
    send(d: string): void {
      this.sent.push(d)
    }
    open(): void {
      this.readyState = 1
      this.onopen?.()
    }
  }

  beforeEach(() => {
    FakeWS.instances = []
    vi.stubGlobal('WebSocket', FakeWS)
  })

  it('łączy się z /ws z tokenem i przekazuje wiadomości', async () => {
    const { connection } = await load()
    const status = vi.fn()
    const handler = vi.fn()
    connection.onStatus(status)
    connection.onMessage(handler)
    connection.connect()
    const ws = FakeWS.instances[0]
    expect(ws.url).toBe('ws://192.168.1.10:4000/ws?token=sekret')

    connection.send({ type: 'audio:loopback' })
    expect(ws.sent).toEqual([]) // jeszcze niepołączone

    ws.open()
    expect(status).toHaveBeenCalledWith(true)
    connection.send({ type: 'audio:loopback' })
    expect(ws.sent).toEqual(['{"type":"audio:loopback"}'])

    ws.onmessage!({ data: '{"type":"error","message":"x"}' })
    ws.onmessage!({ data: 'nie json' })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ type: 'error', message: 'x' })
  })

  it('po rozłączeniu łączy się ponownie z rosnącym opóźnieniem', async () => {
    vi.useFakeTimers()
    const { connection } = await load()
    const status = vi.fn()
    connection.onStatus(status)
    connection.connect()
    FakeWS.instances[0].onclose!()
    expect(status).toHaveBeenLastCalledWith(false)

    vi.advanceTimersByTime(499)
    expect(FakeWS.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeWS.instances).toHaveLength(2)

    FakeWS.instances[1].onclose!()
    vi.advanceTimersByTime(999)
    expect(FakeWS.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeWS.instances).toHaveLength(3)

    // Udane połączenie resetuje opóźnienie.
    FakeWS.instances[2].open()
    FakeWS.instances[2].onclose!()
    vi.advanceTimersByTime(500)
    expect(FakeWS.instances).toHaveLength(4)
  })
})
