import { describe, expect, it } from 'vitest'
import {
  hiddenPageFocusAction,
  shouldFocusPageOnTabSelect,
  shouldRestorePageFocus
} from './focus-restore'

describe('shouldRestorePageFocus', () => {
  it('restores the page when the page held focus', () => {
    expect(shouldRestorePageFocus({ target: 'page', hasActivePage: true })).toBe(true)
  })

  it('leaves the chrome alone when the address bar held focus', () => {
    expect(shouldRestorePageFocus({ target: 'chrome', hasActivePage: true })).toBe(false)
  })

  it('does nothing when the active tab has no page (settings tab)', () => {
    expect(shouldRestorePageFocus({ target: 'page', hasActivePage: false })).toBe(false)
  })
})

describe('shouldFocusPageOnTabSelect', () => {
  const base = { userDriven: true, windowFocused: true, hasActivePage: true, overlayOpen: false }

  it('focuses the page on a user-driven select in the focused window', () => {
    expect(shouldFocusPageOnTabSelect(base)).toBe(true)
  })

  it('leaves focus alone for a scripted select', () => {
    expect(shouldFocusPageOnTabSelect({ ...base, userDriven: false })).toBe(false)
  })

  it('never focuses a page in a background window', () => {
    expect(shouldFocusPageOnTabSelect({ ...base, windowFocused: false })).toBe(false)
  })

  it('does nothing on a chrome-rendered tab with no web view', () => {
    expect(shouldFocusPageOnTabSelect({ ...base, hasActivePage: false })).toBe(false)
  })

  it('leaves the keyboard to the chrome while an overlay is open', () => {
    expect(shouldFocusPageOnTabSelect({ ...base, overlayOpen: true })).toBe(false)
  })
})

describe('hiddenPageFocusAction', () => {
  const base = {
    isActive: false,
    underlaid: false,
    windowFocused: true,
    target: 'page' as const,
    hasActivePage: true
  }
  it('keeps the focus on the active tab', () => {
    expect(hiddenPageFocusAction({ ...base, isActive: true })).toBe('keep')
  })
  it('keeps the focus on an input underlay (visible under the active tab)', () => {
    expect(hiddenPageFocusAction({ ...base, underlaid: true })).toBe('keep')
  })
  it('gives a hidden reloading tab focus back to the active page', () => {
    expect(hiddenPageFocusAction(base)).toBe('page')
  })
  it('gives it back to the chrome when the chrome held the keyboard', () => {
    expect(hiddenPageFocusAction({ ...base, target: 'chrome' })).toBe('chrome')
  })
  it('falls back to the chrome when the active tab has no page (Settings)', () => {
    expect(hiddenPageFocusAction({ ...base, hasActivePage: false })).toBe('chrome')
  })
  it('does nothing in a background window (no foreground theft)', () => {
    expect(hiddenPageFocusAction({ ...base, windowFocused: false })).toBe('ignore')
  })
})
