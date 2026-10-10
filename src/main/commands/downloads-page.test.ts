import { describe, it, expect } from 'vitest'
import { createCommandRegistry, type CommandResult } from '.'
import { makeContext } from './fake-context'
import type { DownloadRecord } from '../downloads'

// The commands behind Settings → Downloads (remove one, acknowledge all, open the folder).

function rec(patch: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    id: 'd1',
    url: 'https://example.com/file.zip',
    filename: 'file.zip',
    savePath: '/home/me/Downloads/file.zip',
    state: 'completed',
    receivedBytes: 1000,
    totalBytes: 1000,
    paused: false,
    startedAt: 1000,
    updatedAt: 1000,
    profileId: 'default',
    ...patch
  }
}

describe('remove-download', () => {
  it('drops a finished download from the list', () => {
    const f = makeContext()
    f.seedDownload(rec({ id: 'a' }))
    f.seedDownload(rec({ id: 'b', state: 'cancelled' }))
    const registry = createCommandRegistry()
    expect(registry.execute('remove-download', { id: 'a' }, f.ctx)).toEqual({ ok: true })
    expect(f.downloadsList().map((d) => d.id)).toEqual(['b'])
  })

  it('refuses a running download, an unknown id and a missing id', () => {
    const f = makeContext()
    f.seedDownload(rec({ id: 'run', state: 'progressing' }))
    const registry = createCommandRegistry()
    const res = registry.execute('remove-download', { id: 'run' }, f.ctx) as CommandResult
    expect(res).toEqual({ ok: false, error: 'no finished download: run' })
    expect(registry.execute('remove-download', { id: 'zz' }, f.ctx)).toMatchObject({ ok: false })
    expect(registry.execute('remove-download', {}, f.ctx)).toEqual({
      ok: false,
      error: 'missing "id"'
    })
    expect(f.downloadsList()).toHaveLength(1)
  })
})

describe('mark-downloads-seen', () => {
  it('clears the unseen badge', () => {
    const f = makeContext()
    f.seedDownload(rec({ id: 'a' }))
    f.seedDownload(rec({ id: 'b' }))
    f.seedDownload(rec({ id: 'c', state: 'progressing' }))
    const registry = createCommandRegistry()
    expect(registry.execute('mark-downloads-seen', {}, f.ctx)).toEqual({ ok: true, marked: 2 })
    expect(registry.execute('get-download-stats', {}, f.ctx)).toMatchObject({ unseen: 0 })
    expect(registry.execute('mark-downloads-seen', {}, f.ctx)).toEqual({ ok: true, marked: 0 })
  })
})

describe('open-downloads-folder', () => {
  it('opens the folder', async () => {
    const f = makeContext()
    const registry = createCommandRegistry()
    expect(await registry.execute('open-downloads-folder', {}, f.ctx)).toEqual({ ok: true })
    expect(f.downloadsFolderOpens()).toBe(1)
  })
})
