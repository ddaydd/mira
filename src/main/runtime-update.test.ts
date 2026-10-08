import { describe, it, expect } from 'vitest'
import { electronTrackUrl, runtimeNoticeFor } from './runtime-update'

describe('electronTrackUrl', () => {
  it('tracks the running major', () => {
    expect(electronTrackUrl('44.7.0')).toBe('https://registry.npmjs.org/electron/44-x-y')
    expect(electronTrackUrl('v45.0.1')).toBe('https://registry.npmjs.org/electron/45-x-y')
  })

  it('refuses a version it cannot read', () => {
    expect(() => electronTrackUrl('nightly')).toThrow(/unparsable/)
  })
})

describe('runtimeNoticeFor', () => {
  const current = { electron: '44.7.0', chrome: '152.0.7977.130' }

  it('announces a newer patch with its release notes', () => {
    const notice = runtimeNoticeFor({ kind: 'newer', version: [44, 8, 0] }, current)
    expect(notice.title).toBe('Chromium update available')
    expect(notice.body).toContain('Electron 44.8.0 is out (Mira runs 44.7.0')
    expect(notice.open).toBe('https://releases.electronjs.org/release/v44.8.0')
  })

  it('says so when up to date, and passes a failure through', () => {
    expect(runtimeNoticeFor({ kind: 'up-to-date' }, current).body).toContain('44.7.0')
    expect(runtimeNoticeFor({ kind: 'failed', error: 'offline' }, current)).toEqual({
      title: 'Could not check for a Chromium update',
      body: 'offline'
    })
  })
})
