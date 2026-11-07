import { app } from 'electron'
import { randomBytes } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_PORT } from '@shared/types'

export interface Config {
  /** Preferowany port serwera; zajęty → następny wolny. */
  port: number
  /** Folder biblioteki wideo. */
  libraryDir: string
  /** Słuchaj na 0.0.0.0 (dostęp z telefonu); wtedy spoza loopbacka wymagany jest token. */
  lan: boolean
  token: string
  /** Otwórz panel w przeglądarce przy starcie (tylko build produkcyjny). */
  openPanelOnStart: boolean
  /** Linux: przy starcie utwórz wejście Loopback z monitora domyślnego wyjścia. */
  autoLoopback: boolean
}

export const dataDir = (): string => app.getPath('userData')
const configPath = (): string => join(dataDir(), 'config.json')

function defaults(): Config {
  return {
    port: DEFAULT_PORT,
    libraryDir: join(app.getPath('videos'), 'visualizer'),
    lan: false,
    token: randomBytes(12).toString('hex'),
    openPanelOnStart: true,
    autoLoopback: true
  }
}

export function loadConfig(): Config {
  const base = defaults()
  let raw: Partial<Config> = {}
  try {
    raw = JSON.parse(readFileSync(configPath(), 'utf8'))
  } catch {
    // brak pliku lub zły JSON → domyślne
  }
  const config: Config = {
    port: Number.isInteger(raw.port) && raw.port! > 0 && raw.port! < 65536 ? raw.port! : base.port,
    libraryDir:
      typeof raw.libraryDir === 'string' && raw.libraryDir ? raw.libraryDir : base.libraryDir,
    lan: raw.lan === true,
    token: typeof raw.token === 'string' && raw.token.length >= 16 ? raw.token : base.token,
    openPanelOnStart: raw.openPanelOnStart !== false,
    autoLoopback: raw.autoLoopback !== false
  }
  mkdirSync(config.libraryDir, { recursive: true })
  saveConfig(config)
  return config
}

export function saveConfig(config: Config): void {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(configPath(), JSON.stringify(config, null, 2))
}
