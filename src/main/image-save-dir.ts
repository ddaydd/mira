// Where "Save Image" puts a file, per profile. "Save Image As…" opens the OS save
// dialog on this folder and remembers the folder the user picked, so the next
// save (quick or not) of the same profile lands there again. A profile with no
// remembered folder, or whose folder has since disappeared, falls back to the
// Downloads folder.
//
// Pure map algebra + a tiny JSON file store (fs only, no Electron), tested in
// image-save-dir.test.ts.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, isAbsolute } from 'path'

/** profileId → absolute folder. */
export type ImageSaveDirs = Record<string, string>

/** Defensively parse the persisted file: keep only string → absolute path entries. */
export function normalizeImageSaveDirs(raw: unknown): ImageSaveDirs {
  const out: ImageSaveDirs = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [id, dir] of Object.entries(raw as Record<string, unknown>)) {
    if (id && typeof dir === 'string' && isAbsolute(dir)) out[id] = dir
  }
  return out
}

/** The folder a profile saves images into: its remembered one while it still
 * exists, else `fallback`. Pure (`exists` is injected). */
export function imageSaveDirFor(
  dirs: ImageSaveDirs,
  profileId: string,
  fallback: string,
  exists: (path: string) => boolean
): string {
  const dir = dirs[profileId]
  return dir && exists(dir) ? dir : fallback
}

/** Return the map with a profile's folder set. Pure. */
export function withImageSaveDir(
  dirs: ImageSaveDirs,
  profileId: string,
  dir: string
): ImageSaveDirs {
  return { ...dirs, [profileId]: dir }
}

export class ImageSaveDirStore {
  private dirs: ImageSaveDirs

  constructor(private readonly path: string) {
    let raw: unknown = {}
    try {
      if (existsSync(path)) raw = JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
      console.error('[mira] unreadable image-save-dirs.json, starting empty', error)
    }
    this.dirs = normalizeImageSaveDirs(raw)
  }

  dirFor(profileId: string, fallback: string): string {
    return imageSaveDirFor(this.dirs, profileId, fallback, existsSync)
  }

  remember(profileId: string, dir: string): void {
    if (!isAbsolute(dir) || this.dirs[profileId] === dir) return
    this.dirs = withImageSaveDir(this.dirs, profileId, dir)
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      const tmp = `${this.path}.tmp`
      writeFileSync(tmp, JSON.stringify(this.dirs), 'utf8')
      renameSync(tmp, this.path)
    } catch (error) {
      console.error('[mira] failed to write image-save-dirs.json', error)
    }
  }
}
