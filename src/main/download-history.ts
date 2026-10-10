// Downloads history kept across restarts (Settings → Downloads). The upstream
// DownloadTracker (downloads.ts) is in-memory only: quitting Mira lost the list,
// and the status-bar badge only ever reached the latest file. This subclass
// mirrors every change to <userData>/downloads.json — at once, except the
// progress ticks of a running download (several a second), which are debounced.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { DownloadTracker, type DownloadRecord, type DownloadState } from './downloads'

/** Finished downloads kept on disk; the oldest beyond this are dropped. */
export const DOWNLOAD_HISTORY_LIMIT = 200

/** A listed record, plus whether its file is gone from disk (deleted / moved). */
export type ListedDownload = DownloadRecord & { missing?: boolean }

const STATES: readonly DownloadState[] = ['progressing', 'completed', 'cancelled', 'interrupted']

/** Validate a parsed downloads.json. Pure. A download still `progressing` on
 * disk died with the previous run (its DownloadItem is gone): it comes back
 * `interrupted`. Restored records are `seen` — the status-bar badge is about what
 * landed during this run. Keeps the newest DOWNLOAD_HISTORY_LIMIT, newest first. */
export function normalizeDownloadHistory(raw: unknown): DownloadRecord[] {
  if (!Array.isArray(raw)) return []
  const out: DownloadRecord[] = []
  const ids = new Set<string>()
  for (const r of raw as Array<Record<string, unknown>>) {
    if (!r || typeof r !== 'object') continue
    const { id, url, filename, savePath, state, startedAt } = r
    if (typeof id !== 'string' || !id || ids.has(id)) continue
    if (typeof filename !== 'string' || typeof savePath !== 'string') continue
    if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) continue
    if (!STATES.includes(state as DownloadState)) continue
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
    ids.add(id)
    out.push({
      id,
      url: typeof url === 'string' ? url : '',
      filename,
      savePath,
      state: state === 'progressing' ? 'interrupted' : (state as DownloadState),
      receivedBytes: num(r.receivedBytes),
      totalBytes: num(r.totalBytes),
      paused: false,
      seen: true,
      startedAt,
      updatedAt: num(r.updatedAt) || startedAt,
      profileId: typeof r.profileId === 'string' ? r.profileId : ''
    })
  }
  out.sort((a, b) => b.startedAt - a.startedAt)
  return out.slice(0, DOWNLOAD_HISTORY_LIMIT)
}

/** DownloadTracker that loads from and saves to a JSON file. */
export class PersistentDownloadTracker extends DownloadTracker {
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly path: string,
    private readonly delayMs = 1000
  ) {
    super()
    let raw: unknown = []
    try {
      if (existsSync(path)) raw = JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
      console.error('[mira] unreadable downloads.json, starting empty', error)
    }
    for (const record of normalizeDownloadHistory(raw)) super.add(record)
  }

  override add(record: DownloadRecord): void {
    super.add(record)
    this.flush()
  }

  override update(
    id: string,
    patch: Partial<Omit<DownloadRecord, 'id'>>,
    at: number
  ): DownloadRecord | undefined {
    const next = super.update(id, patch, at)
    // Only progress ticks are debounced; every other change is written at once,
    // so no quit hook is needed to keep it.
    if (next && patch.state && patch.state !== 'progressing') this.flush()
    else if (next) this.scheduleSave()
    return next
  }

  override remove(id: string): boolean {
    const removed = super.remove(id)
    if (removed) this.flush()
    return removed
  }

  override clearInactive(): number {
    const removed = super.clearInactive()
    if (removed) this.flush()
    return removed
  }

  /** Newest first, each completed record flagged `missing` when its file is gone. */
  override list(): ListedDownload[] {
    return super
      .list()
      .map((r) =>
        r.state === 'completed' && !existsSync(r.savePath) ? { ...r, missing: true } : r
      )
  }

  /** Write now (also what the debounce timer runs). */
  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      const tmp = `${this.path}.tmp`
      const records = super.list().slice(0, DOWNLOAD_HISTORY_LIMIT)
      writeFileSync(tmp, JSON.stringify(records), 'utf8')
      renameSync(tmp, this.path)
    } catch (error) {
      console.error('[mira] failed to write downloads.json', error)
    }
  }

  private scheduleSave(): void {
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), this.delayMs)
    // Never keep the process alive just to save the list.
    this.timer.unref?.()
  }
}

/** Drop one FINISHED download from a tracker (a running one must be cancelled
 * first). False for an unknown id or a running download. */
export function removeFinishedDownload(tracker: DownloadTracker, id: string): boolean {
  const record = tracker.get(id)
  if (!record || record.state === 'progressing') return false
  return tracker.remove(id)
}

/** Mark every unseen completed download seen; returns how many changed. */
export function markCompletedSeen(tracker: DownloadTracker, at: number): number {
  let marked = 0
  for (const r of tracker.list()) {
    if (r.state === 'completed' && !r.seen) {
      tracker.update(r.id, { seen: true }, at)
      marked++
    }
  }
  return marked
}
