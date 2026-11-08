import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable } from 'stream'
import { Library, safeFileName } from './library'

let root: string
let lib: Library

const stream = (text: string): Readable => Readable.from([Buffer.from(text)])

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vz-lib-'))
  lib = new Library(join(root, 'videos'), join(root, 'data'))
  await lib.init()
})

afterEach(async () => {
  lib.close()
  await rm(root, { recursive: true, force: true })
})

describe('safeFileName', () => {
  it('zostawia samą nazwę pliku bez ścieżki', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd')
    expect(safeFileName('/tmp/a.mp4')).toBe('a.mp4')
  })

  it('usuwa niebezpieczne znaki i kropki na początku', () => {
    expect(safeFileName('a<b>|c.mp4')).toBe('a_b__c.mp4')
    expect(safeFileName('.hidden.mp4')).toBe('hidden.mp4')
  })

  it('zachowuje polskie znaki i nawiasy', () => {
    expect(safeFileName('Żółć (wersja 2).mp4')).toBe('Żółć (wersja 2).mp4')
  })

  it('nie zwraca pustej nazwy', () => {
    expect(safeFileName('...')).toBe('video')
    expect(safeFileName('.mp4')).toBe('mp4')
  })

  it('skraca długie nazwy, ale zachowuje rozszerzenie', () => {
    const name = safeFileName('x'.repeat(300) + '.mp4')
    expect(name).toHaveLength(120)
    expect(name.endsWith('.mp4')).toBe(true)
  })
})

describe('Library', () => {
  it('skanuje tylko pliki wideo, sortuje po nazwie i nadaje stałe id', async () => {
    await writeFile(join(lib.dir, 'b.mp4'), 'bb')
    await writeFile(join(lib.dir, 'a.WEBM'), 'a')
    await writeFile(join(lib.dir, 'notes.txt'), 'x')
    const items = await lib.scan()
    expect(items.map((i) => i.name)).toEqual(['a.WEBM', 'b.mp4'])
    expect(items[1]).toMatchObject({ size: 2, duration: null, thumb: null })
    expect(items[0].id).toMatch(/^[0-9a-f]{12}$/)
    const again = await lib.scan()
    expect(again.map((i) => i.id)).toEqual(items.map((i) => i.id))
    expect(lib.has(items[0].id)).toBe(true)
    expect(lib.fileOf(items[1].id)).toBe('b.mp4')
    expect(lib.fileOf('nope')).toBeNull()
  })

  it('save zapisuje plik i nie nadpisuje istniejącego', async () => {
    expect(await lib.save('clip.mp4', stream('1'))).toBe('clip.mp4')
    expect(await lib.save('clip.mp4', stream('2'))).toBe('clip (1).mp4')
    expect(await lib.save('../clip.mp4', stream('3'))).toBe('clip (2).mp4')
    expect(await readFile(join(lib.dir, 'clip.mp4'), 'utf8')).toBe('1')
    expect(await readFile(join(lib.dir, 'clip (2).mp4'), 'utf8')).toBe('3')
  })

  it('save odrzuca nieobsługiwany format z kodem 415', async () => {
    await expect(lib.save('virus.exe', stream('x'))).rejects.toMatchObject({ statusCode: 415 })
    expect(existsSync(join(lib.dir, 'virus.exe'))).toBe(false)
  })

  it('save usuwa częściowy plik, gdy strumień się wywali', async () => {
    const broken = new Readable({
      read() {
        this.push('część')
        this.destroy(new Error('przerwano'))
      }
    })
    await expect(lib.save('broken.mp4', broken)).rejects.toThrow('przerwano')
    expect(existsSync(join(lib.dir, 'broken.mp4'))).toBe(false)
  })

  it('setMeta zapisuje długość i miniaturę, a meta przetrwa restart', async () => {
    await writeFile(join(lib.dir, 'a.mp4'), 'a')
    const [item] = await lib.scan()
    await lib.setMeta(item.id, 12.5, Buffer.from([0xff, 0xd8, 0xff]))
    const [withMeta] = await lib.scan()
    expect(withMeta.duration).toBe(12.5)
    expect(withMeta.thumb).toMatch(new RegExp(`^/api/library/${item.id}/thumb\\?v=\\d+$`))
    expect(existsSync(join(lib.thumbsRoot, lib.thumbFile(item.id)))).toBe(true)

    const reopened = new Library(lib.dir, join(root, 'data'))
    await reopened.init()
    expect(reopened.list()[0].duration).toBe(12.5)
  })

  it('setMeta ignoruje nieznane id', async () => {
    await lib.setMeta('nope', 3, null)
    expect(existsSync(join(root, 'data', 'library-meta.json'))).toBe(false)
  })

  it('remove usuwa plik, miniaturę i metadane', async () => {
    await writeFile(join(lib.dir, 'a.mp4'), 'a')
    const [item] = await lib.scan()
    await lib.setMeta(item.id, 1, Buffer.from([0xff, 0xd8]))
    await lib.remove(item.id)
    expect(existsSync(join(lib.dir, 'a.mp4'))).toBe(false)
    expect(existsSync(join(lib.thumbsRoot, lib.thumbFile(item.id)))).toBe(false)
    expect(await lib.scan()).toEqual([])
    await lib.remove('nope') // brak błędu
  })
})
