// Proces główny: okno wizualizacji + backend (Fastify) w jednym procesie.
// Panel (WS) → serwer → stan → IPC → okno wizualizacji; audio wraca z okna → WS → panel.

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  screen,
  session,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { randomBytes } from 'crypto'
import { join } from 'path'
import type { ClientMessage, FrontInit } from '@shared/types'
import { dataDir, loadConfig, saveConfig } from './config'
import { Library } from './library'
import { Loopback } from './loopback'
import { Projects } from './projects'
import { parseAudioLevels, parseAudioStatus } from './protocol'
import { ControlServer } from './server'
import { AppStore } from './store'
import { capturePreview, createFrontWindow, listDisplays, setFullscreen } from './window'

// Sprzętowe dekodowanie wideo (VAAPI) na Linuksie.
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoDecodeLinuxGL')

let front: BrowserWindow | null = null

async function main(): Promise<void> {
  await app.whenReady()
  electronApp.setAppUserModelId('dev.addiator.visualizer')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

  const config = loadConfig()
  const library = new Library(config.libraryDir, dataDir())
  await library.init()
  const projects = new Projects(join(dataDir(), 'projects'))
  await projects.init()

  const store = new AppStore(join(dataDir(), 'state.json'), {
    port: 0,
    localUrl: '',
    panelUrl: '',
    lan: false,
    lanUrls: []
  })
  store.setLibrary(library.list())
  store.setOutput({ displays: listDisplays() })

  // Przed otwarciem okna, żeby front od razu zobaczył wejście Loopback.
  const loopback = new Loopback()
  let loopbackStatus = await loopback.refresh()
  if (config.autoLoopback && loopbackStatus.state === 'off')
    loopbackStatus = await loopback.create()
  store.setLoopback(loopbackStatus)

  const refreshLibrary = async (): Promise<void> => store.setLibrary(await library.scan())
  const openPanel = (): void => {
    const url = store.get().server.panelUrl
    if (url) void shell.openExternal(url)
  }

  const handleMessage = (msg: ClientMessage): void => {
    switch (msg.type) {
      case 'playback:select':
        return store.select(msg.id)
      case 'effects:set':
        return store.setParam(msg.node, msg.param, msg.value)
      case 'node:bypass':
        return store.setBypass(msg.node, msg.bypass)
      case 'graph:set':
        return store.setGraph(msg.graph)
      case 'audio:device':
        return store.setAudioDevice(msg.deviceId)
      case 'output:fullscreen':
        if (front) void setFullscreen(front, msg.on, msg.displayId ?? null)
        return
      case 'settings:lan':
        void setLan(msg.enabled)
        return
      case 'audio:loopback':
        void loopback.create().then((s) => store.setLoopback(s))
        return
    }
  }

  const mediaKey = randomBytes(16).toString('hex')
  const server = new ControlServer({
    config,
    store,
    library,
    projects,
    panelDir: join(__dirname, '../panel'),
    // Panel z Vite tylko przy `npm run dev` (electron-vite ustawia wtedy ELECTRON_RENDERER_URL).
    devPanelUrl: is.dev && process.env['ELECTRON_RENDERER_URL'] ? 'http://127.0.0.1:5174' : null,
    mediaKey,
    onClientMessage: handleMessage,
    onLibraryChanged: refreshLibrary,
    capturePreview: () => (front ? capturePreview(front) : Promise.resolve(null))
  })

  async function setLan(enabled: boolean): Promise<void> {
    if (config.lan === enabled) return
    config.lan = enabled
    saveConfig(config)
    store.setServer(await server.restart())
  }

  store.subscribe((msg) => {
    server.broadcast(msg)
    if (msg.type !== 'audio' && front && !front.isDestroyed())
      front.webContents.send('front:message', msg)
  })

  store.setServer(await server.start())
  library.watch(() => void refreshLibrary())

  const updateDisplays = (): void => store.setOutput({ displays: listDisplays() })
  screen.on('display-added', updateDisplays)
  screen.on('display-removed', updateDisplays)
  screen.on('display-metrics-changed', updateDisplays)

  // --- IPC z oknem wizualizacji ---
  const fromFront = (e: IpcMainEvent | IpcMainInvokeEvent): boolean =>
    front !== null && !front.isDestroyed() && e.sender === front.webContents

  ipcMain.handle('front:init', (e): FrontInit => {
    if (!fromFront(e)) throw new Error('Nieznany nadawca')
    return { state: store.get(), mediaKey }
  })
  ipcMain.on('front:audio', (e, v) => {
    const levels = fromFront(e) ? parseAudioLevels(v) : null
    if (levels) store.audio(levels)
  })
  ipcMain.on('front:audio-status', (e, v) => {
    const status = fromFront(e) ? parseAudioStatus(v) : null
    if (status) store.setAudioStatus(status)
  })
  ipcMain.on('front:open-panel', (e) => {
    if (fromFront(e)) openPanel()
  })

  // Mikrofon/loopback tylko dla okna wizualizacji.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === 'media' && front !== null && wc === front.webContents)
  })

  const openFront = (): void => {
    front = createFrontWindow({ onOpenPanel: openPanel })
    front.on('enter-full-screen', () => store.setOutput({ fullscreen: true }))
    front.on('leave-full-screen', () => store.setOutput({ fullscreen: false }))
    front.on('closed', () => {
      front = null
    })
  }
  openFront()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openFront()
  })
  app.on('second-instance', () => {
    if (front?.isMinimized()) front.restore()
    front?.focus()
  })

  let quitting = false
  app.on('before-quit', (e) => {
    if (quitting) return
    e.preventDefault()
    quitting = true
    library.close()
    void Promise.allSettled([store.persist(), server.stop(), loopback.cleanup()]).finally(() =>
      app.quit()
    )
  })

  if (!is.dev && config.openPanelOnStart) openPanel()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('window-all-closed', () => app.quit())
  main().catch((err) => {
    dialog.showErrorBox('Visualizer', err instanceof Error ? err.message : String(err))
    app.exit(1)
  })
}
