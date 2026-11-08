import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const paths = vi.hoisted(() => ({ userData: '', videos: '' }))

vi.mock('electron', () => ({
  app: { getPath: (name: 'userData' | 'videos') => paths[name] }
}))

import { loadConfig, saveConfig } from './config'

let root: string
const configFile = (): string => join(paths.userData, 'config.json')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vz-config-'))
  paths.userData = join(root, 'userData')
  paths.videos = join(root, 'Videos')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('loadConfig', () => {
  it('tworzy domyślną konfigurację i folder biblioteki', () => {
    const c = loadConfig()
    expect(c).toMatchObject({
      port: 4000,
      libraryDir: join(paths.videos, 'visualizer'),
      lan: false,
      openPanelOnStart: true,
      autoLoopback: true
    })
    expect(c.token).toMatch(/^[0-9a-f]{24}$/)
    expect(existsSync(c.libraryDir)).toBe(true)
    expect(JSON.parse(readFileSync(configFile(), 'utf8'))).toEqual(c)
  })

  it('token jest stały między uruchomieniami', () => {
    expect(loadConfig().token).toBe(loadConfig().token)
  })

  it('zachowuje poprawne wartości z pliku', () => {
    saveConfig({
      port: 5000,
      libraryDir: join(root, 'clips'),
      lan: true,
      token: 'a'.repeat(20),
      openPanelOnStart: false,
      autoLoopback: false
    })
    expect(loadConfig()).toEqual({
      port: 5000,
      libraryDir: join(root, 'clips'),
      lan: true,
      token: 'a'.repeat(20),
      openPanelOnStart: false,
      autoLoopback: false
    })
  })

  it('zastępuje złe wartości domyślnymi', () => {
    saveConfig({
      port: 70000,
      libraryDir: '',
      lan: 'tak' as unknown as boolean,
      token: 'krótki',
      openPanelOnStart: true,
      autoLoopback: true
    })
    const c = loadConfig()
    expect(c.port).toBe(4000)
    expect(c.libraryDir).toBe(join(paths.videos, 'visualizer'))
    expect(c.lan).toBe(false)
    expect(c.token).not.toBe('krótki')
  })

  it('uszkodzony JSON → wartości domyślne', () => {
    loadConfig()
    writeFileSync(configFile(), '{zepsute')
    expect(loadConfig().port).toBe(4000)
  })
})
