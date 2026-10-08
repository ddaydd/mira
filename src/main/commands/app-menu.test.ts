import { describe, it, expect, vi } from 'vitest'
import { createCommandRegistry } from './index'
import { makeContext } from './fake-context'
import { estimateMenuWidth, rightAlignedX } from './app-menu'

// The popup itself is native (untested); here: param validation and dispatch.
describe('show-app-menu', () => {
  it('pops the menu at the cursor when no position is given', () => {
    const { ctx } = makeContext()
    ctx.showAppMenu = vi.fn()
    expect(createCommandRegistry().execute('show-app-menu', undefined, ctx)).toEqual({ ok: true })
    expect(ctx.showAppMenu).toHaveBeenCalledWith(undefined, undefined)
  })

  it('pops the menu at a rounded window position', () => {
    const { ctx } = makeContext()
    ctx.showAppMenu = vi.fn()
    const res = createCommandRegistry().execute('show-app-menu', { x: 980.4, y: 44.6 }, ctx)
    expect(res).toEqual({ ok: true })
    expect(ctx.showAppMenu).toHaveBeenCalledWith({ x: 980, y: 45 }, undefined)
  })

  it('passes a right alignment through with the position', () => {
    const { ctx } = makeContext()
    ctx.showAppMenu = vi.fn()
    const params = { x: 1750, y: 44, align: 'right' }
    expect(createCommandRegistry().execute('show-app-menu', params, ctx)).toEqual({ ok: true })
    expect(ctx.showAppMenu).toHaveBeenCalledWith({ x: 1750, y: 44 }, 'right')
  })

  it('rejects an unknown alignment', () => {
    const { ctx } = makeContext()
    const params = { x: 1, y: 1, align: 'center' }
    expect(createCommandRegistry().execute('show-app-menu', params, ctx)).toEqual({
      ok: false,
      error: '"align" must be "left" or "right"'
    })
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

describe('right-aligned app menu position', () => {
  it('estimates at least the 145 px measured on KDE for the real top-level labels', () => {
    const labels = ['File', 'Edit', 'History', 'Profiles', 'Bookmarks', 'View', 'Window']
    expect(estimateMenuWidth(labels)).toBeGreaterThanOrEqual(145)
  })

  it('puts the right edge on the anchor, clamped to the window', () => {
    expect(rightAlignedX(1750, 147)).toBe(1603)
    expect(rightAlignedX(100, 147)).toBe(0)
  })
})
