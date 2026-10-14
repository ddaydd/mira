// Linux: tie a profile's windows to the desktop launcher that opens that profile.
//
// Every Mira window shares one WM_CLASS ("mira"), so a dock launcher pinned with
// `mira-browser --profile <id>` never gets its window: Plasma files it under the
// plain Mira launcher, next to it. Plasma's task manager reads a per-window
// override first, the `_KDE_NET_WM_DESKTOP_FILE` property (verified 2026-10-14,
// Plasma 5.27 X11: set by hand on the Termix window, the window moved onto its
// launcher). Electron only sets the class app-wide, so the property is written
// with `xprop` once the window is shown.

import { execFile } from 'child_process'
import { readdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { basename, join } from 'path'
import type { BrowserWindow } from 'electron'
import { parseProfileArg } from './profile-store'

export interface DesktopEntry {
  /** File name, `.desktop` suffix included. */
  file: string
  content: string
}

/** The desktop id (file name without `.desktop`) of the launcher that opens
 * `profileId` with Mira, or null. A launcher is a desktop entry whose Exec runs
 * Mira with `--profile <id>`; the first match wins, so a user entry
 * (~/.local/share/applications, listed first) beats a system one. */
export function launcherForProfile(
  profileId: string,
  entries: readonly DesktopEntry[]
): string | null {
  for (const entry of entries) {
    const exec = /^Exec=(.*)$/m.exec(entry.content)?.[1]
    if (!exec || !/mira/i.test(exec)) continue
    if (parseProfileArg(exec.trim().split(/\s+/), {}) === profileId) {
      return entry.file.replace(/\.desktop$/, '')
    }
  }
  return null
}

/** The XDG application dirs, user first (same precedence as the desktop). */
export function applicationDirs(env: NodeJS.ProcessEnv, home: string): string[] {
  const dataHome = env.XDG_DATA_HOME || join(home, '.local/share')
  const dataDirs = (env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':')
  return [dataHome, ...dataDirs].filter(Boolean).map((d) => join(d, 'applications'))
}

function readDesktopEntries(): DesktopEntry[] {
  const entries: DesktopEntry[] = []
  for (const dir of applicationDirs(process.env, homedir())) {
    let files: string[]
    try {
      files = readdirSync(dir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.desktop')) continue
      try {
        const content = readFileSync(join(dir, file), 'utf8')
        if (content.includes('--profile')) entries.push({ file: basename(file), content })
      } catch {
        // unreadable entry: not ours
      }
    }
  }
  return entries
}

/** Point `window` at its profile's launcher, if one exists. Best effort: no
 * xprop, no X11 (Wayland) or no launcher all leave the window as it is. */
export function bindWindowToProfileLauncher(window: BrowserWindow, profileId: string): void {
  const desktopId = launcherForProfile(profileId, readDesktopEntries())
  if (!desktopId || window.isDestroyed()) return
  const handle = window.getNativeWindowHandle()
  const xid = handle.length >= 4 ? handle.readUInt32LE(0) : 0
  if (!xid) return
  execFile(
    'xprop',
    [
      '-id',
      String(xid),
      '-f',
      '_KDE_NET_WM_DESKTOP_FILE',
      '8u',
      '-set',
      '_KDE_NET_WM_DESKTOP_FILE',
      desktopId
    ],
    (error) => {
      if (error) console.warn(`[profile-launcher] xprop failed: ${error.message}`)
    }
  )
}
