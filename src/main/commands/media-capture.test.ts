import { describe, it, expect, vi } from 'vitest'
import { createCommandRegistry } from './index'
import { makeContext } from './fake-context'

// State and menu items are tested in ../media-capture-state.test.ts; here only the
// commands' dispatch (the popup and the reload are native, untested).
describe('show-media-capture-menu', () => {
  it('calls showMediaCaptureMenu and reports ok', () => {
    const { ctx } = makeContext()
    const spy = vi.spyOn(ctx, 'showMediaCaptureMenu')
    expect(createCommandRegistry().execute('show-media-capture-menu', {}, ctx)).toEqual({
      ok: true
    })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('reset-media-capture', () => {
  it('resets the named tab', () => {
    const { ctx } = makeContext()
    const spy = vi.spyOn(ctx, 'resetMediaCapture')
    const res = createCommandRegistry().execute('reset-media-capture', { tabId: 't1' }, ctx)
    expect(res).toEqual({ ok: true })
    expect(spy).toHaveBeenCalledWith('t1')
  })

  it('refuses a missing tabId', () => {
    const { ctx } = makeContext()
    const res = createCommandRegistry().execute('reset-media-capture', {}, ctx)
    expect(res).toEqual({ ok: false, error: '"tabId" must be a non-empty string' })
  })

  it('reports an asleep tab as a failure', () => {
    const { ctx } = makeContext()
    vi.spyOn(ctx, 'resetMediaCapture').mockImplementation(() => {
      throw new Error('tab is asleep')
    })
    const res = createCommandRegistry().execute('reset-media-capture', { tabId: 't1' }, ctx)
    expect(res).toMatchObject({ ok: false, error: 'tab is asleep' })
  })
})
