import { describe, it, expect } from 'vitest'
import { createCommandRegistry } from './index'
import { makeContext } from './fake-context'
import { windowForProfile } from './tabs'

describe('windowForProfile', () => {
  const windows = [
    { windowId: 'w1', profileId: 'pro' },
    { windowId: 'w2', profileId: 'perso' },
    { windowId: 'w3', profileId: 'perso' }
  ]

  it("resolves a profile's only window", () => {
    expect(windowForProfile(windows, 'pro')).toEqual({ windowId: 'w1' })
  })

  it('refuses a profile with no open window', () => {
    expect(windowForProfile(windows, 'other')).toEqual({ error: 'profile not open: other' })
  })

  it('names the windows when the profile has several', () => {
    expect(windowForProfile(windows, 'perso')).toEqual({
      error: 'profile perso has 2 windows, pass "windowId" (one of w2, w3)'
    })
  })
})

describe('list-tabs by profile', () => {
  it("lists the profile's window and echoes its id", () => {
    const { ctx } = makeContext()
    const result = createCommandRegistry().execute('list-tabs', { profileId: 'default' }, ctx) as {
      ok: boolean
      windowId?: string
      tabs?: unknown[]
    }
    expect(result.ok).toBe(true)
    expect(result.windowId).toBe('fake-window')
    expect(Array.isArray(result.tabs)).toBe(true)
  })

  it('refuses a profile that is not open', () => {
    const { ctx } = makeContext()
    expect(createCommandRegistry().execute('list-tabs', { profileId: 'nope' }, ctx)).toEqual({
      ok: false,
      error: 'profile not open: nope'
    })
  })

  it('refuses an unknown key instead of listing the focused window', () => {
    const { ctx } = makeContext()
    expect(createCommandRegistry().execute('list-tabs', { profile: 'default' }, ctx)).toEqual({
      ok: false,
      error: 'unknown param "profile" (accepted: "windowId", "profileId")'
    })
  })

  it('refuses windowId and profileId together', () => {
    const { ctx } = makeContext()
    const result = createCommandRegistry().execute(
      'list-tabs',
      { windowId: 'fake-window', profileId: 'default' },
      ctx
    )
    expect(result).toEqual({ ok: false, error: 'pass "windowId" or "profileId", not both' })
  })
})
