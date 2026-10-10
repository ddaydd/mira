import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ImageSaveDirStore,
  imageSaveDirFor,
  normalizeImageSaveDirs,
  withImageSaveDir
} from './image-save-dir'

describe('normalizeImageSaveDirs', () => {
  it('keeps only profile → absolute folder entries', () => {
    expect(
      normalizeImageSaveDirs({ a: '/home/x/Images', b: 'relative', c: 3, '': '/tmp' })
    ).toEqual({ a: '/home/x/Images' })
  })

  it('degrades a bad file to an empty map', () => {
    expect(normalizeImageSaveDirs(null)).toEqual({})
    expect(normalizeImageSaveDirs(['/tmp'])).toEqual({})
    expect(normalizeImageSaveDirs('x')).toEqual({})
  })
})

describe('imageSaveDirFor', () => {
  const dirs = { perso: '/home/x/Images', pro: '/gone' }
  const exists = (p: string): boolean => p !== '/gone'

  it("returns the profile's remembered folder", () => {
    expect(imageSaveDirFor(dirs, 'perso', '/dl', exists)).toBe('/home/x/Images')
  })

  it('falls back when the profile has no folder, or its folder is gone', () => {
    expect(imageSaveDirFor(dirs, 'other', '/dl', exists)).toBe('/dl')
    expect(imageSaveDirFor(dirs, 'pro', '/dl', exists)).toBe('/dl')
  })
})

describe('withImageSaveDir', () => {
  it('sets one profile without touching the others', () => {
    const before = { a: '/x' }
    expect(withImageSaveDir(before, 'b', '/y')).toEqual({ a: '/x', b: '/y' })
    expect(before).toEqual({ a: '/x' })
  })
})

describe('ImageSaveDirStore', () => {
  it('remembers a folder per profile and reads it back from disk', () => {
    const root = mkdtempSync(join(tmpdir(), 'mira-isd-'))
    try {
      const pics = join(root, 'pics')
      mkdirSync(pics)
      const file = join(root, 'image-save-dirs.json')
      const store = new ImageSaveDirStore(file)
      expect(store.dirFor('perso', '/dl')).toBe('/dl')
      store.remember('perso', pics)
      expect(store.dirFor('perso', '/dl')).toBe(pics)
      expect(store.dirFor('pro', '/dl')).toBe('/dl')
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ perso: pics })
      expect(new ImageSaveDirStore(file).dirFor('perso', '/dl')).toBe(pics)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
