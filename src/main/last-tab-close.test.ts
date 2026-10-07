import { describe, it, expect } from 'vitest'
import { lastTabClosesWindow } from './last-tab-close'

describe('lastTabClosesWindow', () => {
  it('closes a secondary window whatever closed the tab', () => {
    expect(lastTabClosesWindow({ reason: 'extension', profileWindowCount: 2 })).toBe(true)
    expect(
      lastTabClosesWindow({ reason: 'close-tab', origin: 'external', profileWindowCount: 2 })
    ).toBe(true)
  })

  it('closes the sole window when the user closed the last tab', () => {
    expect(
      lastTabClosesWindow({ reason: 'close-active-tab', origin: 'ui', profileWindowCount: 1 })
    ).toBe(true)
    expect(lastTabClosesWindow({ reason: 'close-tab', origin: 'ui', profileWindowCount: 1 })).toBe(
      true
    )
  })

  it('keeps the sole window open when a script closed the last tab', () => {
    expect(
      lastTabClosesWindow({ reason: 'close-tab', origin: 'external', profileWindowCount: 1 })
    ).toBe(false)
    expect(
      lastTabClosesWindow({ reason: 'close-active-tab', origin: 'external', profileWindowCount: 1 })
    ).toBe(false)
    expect(lastTabClosesWindow({ reason: 'close-tab', profileWindowCount: 1 })).toBe(false)
  })

  it('keeps the sole window open for extension and forget-site closes', () => {
    expect(lastTabClosesWindow({ reason: 'extension', origin: 'ui', profileWindowCount: 1 })).toBe(
      false
    )
    expect(
      lastTabClosesWindow({ reason: 'forget-domain', origin: 'ui', profileWindowCount: 1 })
    ).toBe(false)
  })
})
