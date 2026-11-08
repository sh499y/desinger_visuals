import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { defaultGraph } from '@shared/graph'
import { Projects, isProjectName } from './projects'

let dir: string
let projects: Projects

beforeEach(async () => {
  dir = join(await mkdtemp(join(tmpdir(), 'vz-proj-')), 'projects')
  projects = new Projects(dir)
  await projects.init()
})

afterEach(async () => {
  await rm(join(dir, '..'), { recursive: true, force: true })
})

describe('isProjectName', () => {
  it('akceptuje litery, cyfry, spacje, _ i -', () => {
    expect(isProjectName('Koncert 2026')).toBe(true)
    expect(isProjectName('żółty_set-1')).toBe(true)
  })

  it('odrzuca ścieżki, puste, za długie i ze spacjami na brzegach', () => {
    expect(isProjectName('../etc')).toBe(false)
    expect(isProjectName('a/b')).toBe(false)
    expect(isProjectName('')).toBe(false)
    expect(isProjectName('x'.repeat(65))).toBe(false)
    expect(isProjectName(' a')).toBe(false)
    expect(isProjectName(5)).toBe(false)
  })
})

describe('Projects', () => {
  it('zapisuje, wczytuje i usuwa projekt', async () => {
    const graph = defaultGraph()
    await projects.save('Set 1', graph)
    expect(await projects.load('Set 1')).toEqual(graph)
    expect(JSON.parse(await projects.raw('Set 1'))).toEqual(graph)
    await projects.remove('Set 1')
    expect(await projects.list()).toEqual([])
  })

  it('load sanityzuje uszkodzony plik', async () => {
    await writeFile(
      join(dir, 'zly.json'),
      JSON.stringify({ nodes: [{ id: 'x', type: 'Nope' }], edges: [] })
    )
    const graph = await projects.load('zly')
    expect(graph.nodes.map((n) => n.type)).toEqual(['Output'])
  })

  it('list sortuje od najnowszych i pomija obce pliki', async () => {
    await projects.save('stary', defaultGraph())
    await projects.save('nowy', defaultGraph())
    await utimes(join(dir, 'stary.json'), new Date(1000), new Date(1000))
    await writeFile(join(dir, 'notatka.txt'), 'x')
    await writeFile(join(dir, 'zła.nazwa!.json'), '{}')
    expect((await projects.list()).map((p) => p.name)).toEqual(['nowy', 'stary'])
  })

  it('odrzuca nieprawidłowe nazwy', async () => {
    await expect(projects.save('../hack', defaultGraph())).rejects.toThrow('Nieprawidłowa nazwa')
    await expect(projects.load('a/b')).rejects.toThrow('Nieprawidłowa nazwa')
  })
})
