// Linux fork: a one-click save ("Save Image to …", "Save Video to …", a yt-dlp
// download) that lands on a name already in its folder asks first — Replace,
// Keep Both (the Chrome-style " (1)" copy), or Cancel — instead of renaming
// silently (a file save) or skipping the download while reporting success
// (yt-dlp). The dialog wording and the answer mapping are pure, tested in
// save-conflict.test.ts; profiles.ts shows the dialog.

import { basename, extname } from 'path'

export type SaveConflictChoice = 'replace' | 'keep-both' | 'cancel'

const CHOICES: SaveConflictChoice[] = ['replace', 'keep-both', 'cancel']

/** Options for Electron's `dialog.showMessageBox`: `name` is taken in `dir`, `alt`
 * is the free name Keep Both would use. Pure. */
export function saveConflictDialog(
  name: string,
  dir: string,
  alt: string
): {
  type: 'question'
  title: string
  message: string
  detail: string
  buttons: string[]
  defaultId: number
  cancelId: number
  noLink: boolean
} {
  return {
    type: 'question',
    title: 'File Already Exists',
    message: `"${name}" already exists in ${basename(dir) || dir}.`,
    detail: `Replace it, or keep both and save the new one as "${alt}"?`,
    buttons: ['Replace', 'Keep Both', 'Cancel'],
    defaultId: 1,
    cancelId: 2,
    noLink: true
  }
}

/** The choice behind the button index `showMessageBox` resolved with. Pure. */
export function saveConflictChoice(response: number): SaveConflictChoice {
  return CHOICES[response] ?? 'cancel'
}

/** yt-dlp output template saving to `file` with whatever extension it picks
 * (the merged format can differ from the announced one). `%` is escaped so a
 * title never reads as a field. Pure. */
export function ytdlpTemplateFor(file: string): string {
  const ext = extname(file)
  const stem = ext ? file.slice(0, -ext.length) : file
  return `${stem.replace(/%/g, '%%')}.%(ext)s`
}
