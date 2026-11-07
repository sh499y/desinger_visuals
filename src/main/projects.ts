// Projekty: grafy zapisane jako JSON w <userData>/projects.

import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { sanitizeGraph } from '@shared/graph'
import type { Graph, ProjectInfo } from '@shared/types'

const NAME_RE = /^[\p{L}\p{N} _-]{1,64}$/u

export function isProjectName(name: unknown): name is string {
  return typeof name === 'string' && NAME_RE.test(name) && name.trim() === name
}

export class Projects {
  constructor(private readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true })
  }

  private path(name: string): string {
    if (!isProjectName(name)) throw new Error('Nieprawidłowa nazwa projektu')
    return join(this.dir, `${name}.json`)
  }

  async list(): Promise<ProjectInfo[]> {
    const files = (await readdir(this.dir)).filter((f) => f.endsWith('.json'))
    const out: ProjectInfo[] = []
    for (const f of files) {
      const name = f.slice(0, -5)
      if (!isProjectName(name)) continue
      out.push({ name, savedAt: (await stat(join(this.dir, f))).mtimeMs })
    }
    return out.sort((a, b) => b.savedAt - a.savedAt)
  }

  async save(name: string, graph: Graph): Promise<void> {
    await writeFile(this.path(name), JSON.stringify(graph, null, 2))
  }

  async load(name: string): Promise<Graph> {
    return sanitizeGraph(JSON.parse(await readFile(this.path(name), 'utf8')))
  }

  async raw(name: string): Promise<string> {
    return readFile(this.path(name), 'utf8')
  }

  async remove(name: string): Promise<void> {
    await unlink(this.path(name))
  }
}
