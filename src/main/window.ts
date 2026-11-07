// Okno wizualizacji (front): sam canvas, bez UI.

import { BrowserWindow, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import type { DisplayInfo } from '@shared/types'
import icon from '../../resources/icon.png?asset'

export function createFrontWindow(opts: { onOpenPanel(): void }): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    title: 'Visualizer',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Render ma iść dalej, gdy okno jest zasłonięte (projektor, drugi ekran).
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    if (!(is.dev && url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '\0')))
      e.preventDefault()
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.control || input.alt || input.meta) return
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen())
      event.preventDefault()
    } else if (input.key === 'Escape' && win.isFullScreen()) {
      win.setFullScreen(false)
      event.preventDefault()
    } else if (input.key.toLowerCase() === 'p') {
      opts.onOpenPanel()
      event.preventDefault()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

export function listDisplays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Ekran ${i + 1}`,
    width: d.size.width,
    height: d.size.height,
    primary: d.id === primary
  }))
}

function waitFor(win: BrowserWindow, event: 'leave-full-screen', ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer)
      win.removeListener(event, done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    win.once(event, done)
  })
}

/** Pełny ekran, opcjonalnie na wskazanym monitorze (projektor). */
export async function setFullscreen(
  win: BrowserWindow,
  on: boolean,
  displayId: number | null
): Promise<void> {
  if (!on) {
    win.setFullScreen(false)
    return
  }
  const target =
    displayId !== null ? screen.getAllDisplays().find((d) => d.id === displayId) : undefined
  if (target) {
    if (win.isFullScreen()) {
      win.setFullScreen(false)
      await waitFor(win, 'leave-full-screen', 1000)
    }
    const { x, y, width, height } = target.workArea
    win.setBounds({ x, y, width: Math.min(1280, width), height: Math.min(720, height) })
  }
  win.setFullScreen(true)
}

/** Mała klatka JPEG z okna wizualizacji (z efektami) dla podglądu w panelu. */
export async function capturePreview(win: BrowserWindow): Promise<Buffer | null> {
  if (win.isDestroyed() || win.isMinimized()) return null
  const img = await win.webContents.capturePage()
  if (img.isEmpty()) return null
  const { width } = img.getSize()
  return img.resize({ width: Math.min(480, width), quality: 'good' }).toJPEG(70)
}
