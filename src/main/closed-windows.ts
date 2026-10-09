// Recently closed windows — Chrome's "Reopen closed window".
//
// Closing one of a profile's several windows used to FORGET it (removeSessionEntry
// in profiles.ts): an explicitly dismissed torn-off window should not resurrect at
// launch. Right for the launch, but it also meant the window and every tab in it
// were gone for good — and an agent session window counted as "another window",
// so closing the user's MAIN window while a Claude session window was open erased
// it (2026-10-09: a whole working set lost, rebuilt from history).
//
// This keeps a short, persisted stack of those windows (their saved entry as it
// was at close), newest last. `reopen-closed-window` pops one back; Cmd+Shift+T
// pops it too when the window was closed after the window's last closed tab.
//
// Pure list algebra + a tiny JSON file store (fs only, no Electron), tested in
// closed-windows.test.ts.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { normalizeSessions, type PersistedWindow } from './session-store'

/** How many closed windows are kept (all profiles together). */
export const CLOSED_WINDOW_LIMIT = 10

/** One closed window: its profile, when it closed, and its saved entry. */
export interface ClosedWindow {
  profileId: string
  closedAt: number
  window: PersistedWindow
}

/** Push a closed window (newest last). A window with no tab is not worth keeping;
 * an older record of the same window is replaced; the oldest fall off past the
 * limit. Pure: returns a new list. */
export function pushClosedWindow(
  list: ClosedWindow[],
  entry: ClosedWindow,
  limit = CLOSED_WINDOW_LIMIT
): ClosedWindow[] {
  if (entry.window.tabs.length === 0) return list
  const next = list.filter((c) => c.window.windowId !== entry.window.windowId)
  next.push(entry)
  return next.slice(-limit)
}

/** Take the newest closed window (of `profileId`, when given). Pure. */
export function takeClosedWindow(
  list: ClosedWindow[],
  profileId?: string
): { entry: ClosedWindow | null; rest: ClosedWindow[] } {
  for (let i = list.length - 1; i >= 0; i--) {
    if (profileId === undefined || list[i].profileId === profileId) {
      return { entry: list[i], rest: [...list.slice(0, i), ...list.slice(i + 1)] }
    }
  }
  return { entry: null, rest: list }
}

/** The newest closed-window time of a profile, or null. Pure. */
export function lastClosedWindowAt(list: ClosedWindow[], profileId: string): number | null {
  return takeClosedWindow(list, profileId).entry?.closedAt ?? null
}

/** Cmd+Shift+T: reopen the window rather than a tab when a closed window exists
 * and is more recent than the last closed tab (or no tab was closed). Pure. */
export function reopenWindowFirst(lastTabAt: number | null, lastWindowAt: number | null): boolean {
  if (lastWindowAt === null) return false
  return lastTabAt === null || lastWindowAt > lastTabAt
}

/** Validate the file content: entries with a profile, a time and a window that
 * survives the sessions normalization (same rules as sessions.json). Pure. */
export function normalizeClosedWindows(raw: unknown): ClosedWindow[] {
  if (!Array.isArray(raw)) return []
  const out: ClosedWindow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const v = item as Record<string, unknown>
    if (typeof v.profileId !== 'string' || v.profileId === '') continue
    if (typeof v.closedAt !== 'number' || !Number.isFinite(v.closedAt)) continue
    const window = normalizeSessions({ [v.profileId]: [v.window] })[v.profileId]?.[0]
    if (!window || window.tabs.length === 0) continue
    out.push({ profileId: v.profileId, closedAt: v.closedAt, window })
  }
  return out.slice(-CLOSED_WINDOW_LIMIT)
}

/** The stack on disk (userData/closed-windows.json). Writes are atomic (tmp +
 * rename) and synchronous: a close happens rarely, and must survive a quit that
 * follows right after. */
export class ClosedWindowStore {
  private list: ClosedWindow[]

  constructor(private readonly path: string) {
    let raw: unknown = []
    try {
      if (existsSync(path)) raw = JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
      console.error('[mira] unreadable closed-windows.json, starting empty', error)
    }
    this.list = normalizeClosedWindows(raw)
  }

  all(): ClosedWindow[] {
    return [...this.list]
  }

  push(entry: ClosedWindow): void {
    this.list = pushClosedWindow(this.list, entry)
    this.write()
  }

  take(profileId?: string): ClosedWindow | null {
    const { entry, rest } = takeClosedWindow(this.list, profileId)
    if (entry) {
      this.list = rest
      this.write()
    }
    return entry
  }

  lastAt(profileId: string): number | null {
    return lastClosedWindowAt(this.list, profileId)
  }

  private write(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      const tmp = `${this.path}.tmp`
      writeFileSync(tmp, JSON.stringify(this.list), 'utf8')
      renameSync(tmp, this.path)
    } catch (error) {
      console.error('[mira] failed to write closed-windows.json', error)
    }
  }
}
