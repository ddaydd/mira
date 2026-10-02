import { describe, expect, it } from 'vitest'
import { inputReadiness, viewShown } from './input-underlay'

describe('inputReadiness', () => {
  it('leaves the active tab alone', () => {
    expect(inputReadiness({ isActive: true, activeHasView: true, overlayOpen: false })).toBe(
      'ready'
    )
  })

  it('underlays a background tab instead of selecting it', () => {
    expect(inputReadiness({ isActive: false, activeHasView: true, overlayOpen: false })).toBe(
      'underlay'
    )
  })

  it('selects the tab when no native view would cover the underlay', () => {
    expect(inputReadiness({ isActive: false, activeHasView: false, overlayOpen: false })).toBe(
      'activate'
    )
  })

  it('selects the tab while a chrome overlay hides every view', () => {
    expect(inputReadiness({ isActive: false, activeHasView: true, overlayOpen: true })).toBe(
      'activate'
    )
  })
})

describe('viewShown', () => {
  const base = { isActive: false, underlaid: false, activeHasView: true, overlayOpen: false }

  it('shows the active tab and hides the others', () => {
    expect(viewShown({ ...base, isActive: true })).toBe(true)
    expect(viewShown(base)).toBe(false)
  })

  it('shows an underlaid tab only under a native active view', () => {
    expect(viewShown({ ...base, underlaid: true })).toBe(true)
    expect(viewShown({ ...base, underlaid: true, activeHasView: false })).toBe(false)
  })

  it('hides everything while a chrome overlay is open', () => {
    expect(viewShown({ ...base, isActive: true, overlayOpen: true })).toBe(false)
    expect(viewShown({ ...base, underlaid: true, overlayOpen: true })).toBe(false)
  })
})
