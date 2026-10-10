import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  DOWNLOAD_HISTORY_LIMIT,
  PersistentDownloadTracker,
  normalizeDownloadHistory
} from './download-history'
import type { DownloadRecord } from './downloads'

function rec(id: string, startedAt: number, patch: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    id,
    url: `https://e.org/${id}`,
    filename: `${id}.zip`,
    savePath: `/nowhere/${id}.zip`,
    state: 'completed',
    receivedBytes: 10,
    totalBytes: 10,
    paused: false,
    startedAt,
    updatedAt: startedAt,
    profileId: 'perso',
    ...patch
  }
}

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'mira-dl-')), 'downloads.json')
}

describe('normalizeDownloadHistory', () => {
  it('returns [] for anything but an array', () => {
    expect(normalizeDownloadHistory(null)).toEqual([])
    expect(normalizeDownloadHistory({ a: 1 })).toEqual([])
  })

  it('drops malformed and duplicate records', () => {
    const out = normalizeDownloadHistory([
      rec('a', 1),
      rec('a', 2),
      { ...rec('b', 3), state: 'weird' },
      { ...rec('c', 4), filename: 5 },
      { id: 'd' },
      null
    ])
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  it('turns a download left running by the last run into an interrupted one', () => {
    const [r] = normalizeDownloadHistory([rec('a', 1, { state: 'progressing', paused: true })])
    expect(r.state).toBe('interrupted')
    expect(r.paused).toBe(false)
  })

  it('marks restored records seen, newest first, capped', () => {
    const raw = Array.from({ length: DOWNLOAD_HISTORY_LIMIT + 5 }, (_, i) => rec(`r${i}`, i))
    const out = normalizeDownloadHistory(raw)
    expect(out).toHaveLength(DOWNLOAD_HISTORY_LIMIT)
    expect(out[0].id).toBe(`r${DOWNLOAD_HISTORY_LIMIT + 4}`)
    expect(out.every((r) => r.seen)).toBe(true)
  })
})

describe('PersistentDownloadTracker', () => {
  it('writes a finished download at once and reloads it', () => {
    const path = tmpFile()
    const t = new PersistentDownloadTracker(path, 60_000)
    t.add(rec('a', 1, { state: 'progressing' }))
    t.update('a', { receivedBytes: 5 }, 2)
    let saved = JSON.parse(readFileSync(path, 'utf8')) as DownloadRecord[]
    expect(saved[0].receivedBytes).toBe(10) // progress tick debounced
    t.update('a', { state: 'completed' }, 3)
    saved = JSON.parse(readFileSync(path, 'utf8')) as DownloadRecord[]
    expect(saved.map((r) => [r.id, r.state])).toEqual([['a', 'completed']])

    const again = new PersistentDownloadTracker(path)
    expect(again.get('a')?.state).toBe('completed')
  })

  it('persists removals and clears', () => {
    const path = tmpFile()
    const t = new PersistentDownloadTracker(path, 60_000)
    t.add(rec('a', 1))
    t.add(rec('b', 2))
    t.remove('a')
    expect(new PersistentDownloadTracker(path).list().map((r) => r.id)).toEqual(['b'])
    t.clearInactive()
    expect(new PersistentDownloadTracker(path).list()).toEqual([])
  })

  it('flags a completed download whose file is gone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mira-dl-'))
    const kept = join(dir, 'kept.zip')
    writeFileSync(kept, 'x')
    const t = new PersistentDownloadTracker(join(dir, 'downloads.json'), 60_000)
    t.add(rec('kept', 2, { savePath: kept }))
    t.add(rec('gone', 1))
    const byId = Object.fromEntries(t.list().map((r) => [r.id, r.missing]))
    expect(byId).toEqual({ kept: undefined, gone: true })
  })

  it('starts empty on an unreadable file', () => {
    const path = tmpFile()
    writeFileSync(path, '{not json')
    expect(new PersistentDownloadTracker(path).list()).toEqual([])
  })
})
