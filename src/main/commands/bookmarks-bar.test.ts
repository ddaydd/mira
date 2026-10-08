import { describe, it, expect } from 'vitest'
import { createCommandRegistry } from '.'
import { makeContext } from './fake-context'

describe('toggle-bookmarks-bar', () => {
  it('flips without a param, forces with one', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    expect(registry.execute('toggle-bookmarks-bar', {}, ctx)).toEqual({ ok: true, visible: true })
    expect(registry.execute('toggle-bookmarks-bar', {}, ctx)).toEqual({ ok: true, visible: false })
    const forced = { visible: true }
    expect(registry.execute('toggle-bookmarks-bar', forced, ctx)).toEqual({
      ok: true,
      visible: true
    })
    expect(registry.execute('toggle-bookmarks-bar', forced, ctx)).toEqual({
      ok: true,
      visible: true
    })
  })

  it('shows up in get-settings', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    registry.execute('toggle-bookmarks-bar', { visible: true }, ctx)
    expect(registry.execute('get-settings', {}, ctx)).toMatchObject({ bookmarksBarVisible: true })
  })

  it('rejects a non-boolean', () => {
    const { ctx } = makeContext()
    expect(
      createCommandRegistry().execute('toggle-bookmarks-bar', { visible: 'yes' }, ctx)
    ).toEqual({
      ok: false,
      error: '"visible" must be a boolean'
    })
  })
})

describe('show-bookmarks-menu', () => {
  it('pops the overflow and a folder dropdown', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    const added = registry.execute('add-folder', { title: 'Dev' }, ctx) as unknown as {
      node: { id: string }
    }
    expect(registry.execute('show-bookmarks-menu', { fromIndex: 0 }, ctx)).toEqual({ ok: true })
    const params = { folderId: added.node.id, x: 10.4, y: 40 }
    expect(registry.execute('show-bookmarks-menu', params, ctx)).toEqual({ ok: true })
  })

  it('reports an unknown folder', () => {
    const { ctx } = makeContext()
    const res = createCommandRegistry().execute('show-bookmarks-menu', { folderId: 'nope' }, ctx)
    expect(res).toMatchObject({ ok: false })
  })

  it('validates its params', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    expect(registry.execute('show-bookmarks-menu', { fromIndex: -1 }, ctx)).toEqual({
      ok: false,
      error: '"fromIndex" must be a non-negative integer'
    })
    expect(registry.execute('show-bookmarks-menu', { x: 1 }, ctx)).toEqual({
      ok: false,
      error: '"x" and "y" go together'
    })
  })
})
