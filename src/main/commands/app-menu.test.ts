import { describe, it, expect, vi } from 'vitest'
import { createCommandRegistry } from './index'
import { makeContext } from './fake-context'

// The popup itself is native (untested); here: param validation and dispatch.
describe('show-app-menu', () => {
  it('pops the menu at the cursor when no position is given', () => {
    const { ctx } = makeContext()
    ctx.showAppMenu = vi.fn()
    expect(createCommandRegistry().execute('show-app-menu', undefined, ctx)).toEqual({ ok: true })
    expect(ctx.showAppMenu).toHaveBeenCalledWith(undefined)
  })

  it('pops the menu at a rounded window position', () => {
    const { ctx } = makeContext()
    ctx.showAppMenu = vi.fn()
    const res = createCommandRegistry().execute('show-app-menu', { x: 980.4, y: 44.6 }, ctx)
    expect(res).toEqual({ ok: true })
    expect(ctx.showAppMenu).toHaveBeenCalledWith({ x: 980, y: 45 })
  })

  it('rejects a lone coordinate', () => {
    const { ctx } = makeContext()
    expect(createCommandRegistry().execute('show-app-menu', { x: 10 }, ctx)).toEqual({
      ok: false,
      error: '"x" and "y" go together'
    })
  })

  it('rejects a non-numeric coordinate', () => {
    const { ctx } = makeContext()
    expect(createCommandRegistry().execute('show-app-menu', { x: '10', y: 4 }, ctx)).toEqual({
      ok: false,
      error: '"x" and "y" must be finite numbers'
    })
  })
})
