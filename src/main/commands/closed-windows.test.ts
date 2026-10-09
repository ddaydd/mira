import { describe, it, expect, vi } from 'vitest'
import { createCommandRegistry } from './index'
import { makeContext } from './fake-context'

// The stack logic is tested in ../closed-windows.test.ts; here only the dispatch.
describe('reopen-closed-window', () => {
  it('reopens for any profile by default', () => {
    const { ctx } = makeContext()
    const spy = vi
      .spyOn(ctx, 'reopenClosedWindow')
      .mockReturnValue({ reopened: true, windowId: 'w1', profileId: 'default', tabs: 3 })
    expect(createCommandRegistry().execute('reopen-closed-window', {}, ctx)).toEqual({
      ok: true,
      reopened: true,
      windowId: 'w1',
      profileId: 'default',
      tabs: 3
    })
    expect(spy).toHaveBeenCalledWith(undefined)
  })

  it('passes a profile id through', () => {
    const { ctx } = makeContext()
    const spy = vi.spyOn(ctx, 'reopenClosedWindow')
    createCommandRegistry().execute('reopen-closed-window', { profileId: 'p1' }, ctx)
    expect(spy).toHaveBeenCalledWith('p1')
  })

  it('refuses an empty profile id', () => {
    const { ctx } = makeContext()
    expect(createCommandRegistry().execute('reopen-closed-window', { profileId: '' }, ctx)).toEqual(
      {
        ok: false,
        error: '"profileId" must be a non-empty string'
      }
    )
  })
})

describe('list-closed-windows', () => {
  it('returns the list', () => {
    const { ctx } = makeContext()
    vi.spyOn(ctx, 'listClosedWindows').mockReturnValue([
      { profileId: 'default', closedAt: 5, windowId: 'w1', tabs: 2, titles: ['A', 'B'] }
    ])
    expect(createCommandRegistry().execute('list-closed-windows', {}, ctx)).toEqual({
      ok: true,
      windows: [{ profileId: 'default', closedAt: 5, windowId: 'w1', tabs: 2, titles: ['A', 'B'] }]
    })
  })
})
