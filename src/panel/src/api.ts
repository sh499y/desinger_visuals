// Połączenie panelu z backendem: REST, WebSocket (z ponownym łączeniem) i upload.

import type { ClientMessage, ServerMessage } from '@shared/types'

// Token z adresu (dostęp z telefonu w sieci lokalnej). Na loopbacku niepotrzebny.
const token = ((): string | null => {
  const fromUrl = new URLSearchParams(location.search).get('token')
  try {
    if (fromUrl) sessionStorage.setItem('vz-token', fromUrl)
    return fromUrl ?? sessionStorage.getItem('vz-token')
  } catch {
    return fromUrl
  }
})()

/** Dokleja token do adresu, gdy jest potrzebny. */
export function url(path: string): string {
  if (!token) return path
  return `${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}

export async function api<T = void>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url(path), init)
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      message = ((await res.json()) as { error?: string }).error ?? message
    } catch {
      // odpowiedź bez JSON-a
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const postJson = <T = void>(path: string, body: unknown): Promise<T> =>
  api<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

/** Upload przez XHR, bo fetch nie raportuje postępu wysyłania. */
export function uploadFiles(files: File[], onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    for (const f of files) form.append('file', f, f.name)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url('/api/library'))
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      if (xhr.status < 300) return resolve()
      let message = `HTTP ${xhr.status}`
      try {
        message = JSON.parse(xhr.responseText).error ?? message
      } catch {
        // bez JSON-a
      }
      reject(new Error(message))
    }
    xhr.onerror = () => reject(new Error('Błąd sieci'))
    xhr.send(form)
  })
}

type Handler = (msg: ServerMessage) => void

class Connection {
  private ws: WebSocket | null = null
  private retryMs = 500
  private handlers = new Set<Handler>()
  private statusHandlers = new Set<(connected: boolean) => void>()

  connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}${url('/ws')}`)
    this.ws = ws
    ws.onopen = () => {
      this.retryMs = 500
      this.statusHandlers.forEach((h) => h(true))
    }
    ws.onmessage = (e) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(e.data as string)
      } catch {
        return
      }
      this.handlers.forEach((h) => h(msg))
    }
    ws.onclose = () => {
      this.statusHandlers.forEach((h) => h(false))
      setTimeout(() => this.connect(), this.retryMs)
      this.retryMs = Math.min(this.retryMs * 2, 5000)
    }
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  onMessage(h: Handler): void {
    this.handlers.add(h)
  }

  onStatus(h: (connected: boolean) => void): void {
    this.statusHandlers.add(h)
  }
}

export const connection = new Connection()
