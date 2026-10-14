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

describe('show-bookmark-menu / edit-bookmark', () => {
  it('pops the menu of a known item and refuses an unknown one', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    const f = registry.execute('add-folder', { title: 'Dev' }, ctx) as unknown as {
      node: { id: string }
    }
    const params = { id: f.node.id, x: 12, y: 50 }
    expect(registry.execute('show-bookmark-menu', params, ctx)).toEqual({ ok: true })
    expect(registry.execute('show-bookmark-menu', { id: 'nope' }, ctx)).toMatchObject({ ok: false })
    expect(registry.execute('show-bookmark-menu', {}, ctx)).toEqual({
      ok: false,
      error: 'missing "id"'
    })
  })

  it('edits inline only while the bar is shown', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    const f = registry.execute('add-folder', { title: 'Dev' }, ctx) as unknown as {
      node: { id: string }
    }
    expect(registry.execute('edit-bookmark', { id: f.node.id }, ctx)).toEqual({
      ok: true,
      editing: false
    })
    registry.execute('toggle-bookmarks-bar', { visible: true }, ctx)
    expect(registry.execute('edit-bookmark', { id: f.node.id }, ctx)).toEqual({
      ok: true,
      editing: true
    })
  })
})

describe('add-bookmark-to-bar', () => {
  const top = (ctx: ReturnType<typeof makeContext>['ctx']): string[] =>
    ctx.listBookmarks().tree.map((n) => (n.kind === 'url' ? n.url : n.title))

  it('inserts a new page at the dropped index, the end by default', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    registry.execute('add-bookmark-to-bar', { url: 'https://a/' }, ctx)
    registry.execute('add-bookmark-to-bar', { url: 'https://b/' }, ctx)
    const res = registry.execute(
      'add-bookmark-to-bar',
      { url: 'https://c/', title: 'C', index: 1 },
      ctx
    )
    expect(res).toMatchObject({ ok: true, created: true, index: 1, node: { title: 'C' } })
    expect(top(ctx)).toEqual(['https://a/', 'https://c/', 'https://b/'])
  })

  it('moves an existing favorite instead of duplicating it, both directions', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    for (const url of ['https://a/', 'https://b/', 'https://c/']) {
      registry.execute('add-bookmark-to-bar', { url }, ctx)
    }
    // a dropped in the gap before c (slot 2) lands between b and c
    expect(
      registry.execute('add-bookmark-to-bar', { url: 'https://a/', index: 2 }, ctx)
    ).toMatchObject({ ok: true, created: false, index: 1 })
    expect(top(ctx)).toEqual(['https://b/', 'https://a/', 'https://c/'])
    registry.execute('add-bookmark-to-bar', { url: 'https://c/', index: 0 }, ctx)
    expect(top(ctx)).toEqual(['https://c/', 'https://b/', 'https://a/'])
  })

  it('pulls a favorite out of its folder onto the bar', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    const folder = ctx.addFolder('F').node
    ctx.addBookmark('https://in/', 'In', folder.id)
    registry.execute('add-bookmark-to-bar', { url: 'https://in/', index: 0 }, ctx)
    expect(top(ctx)).toEqual(['https://in/', 'F'])
  })

  it('validates its params', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    expect(registry.execute('add-bookmark-to-bar', {}, ctx)).toEqual({
      ok: false,
      error: 'missing "url"'
    })
    expect(registry.execute('add-bookmark-to-bar', { url: 'https://a/', index: -1 }, ctx)).toEqual({
      ok: false,
      error: '"index" must be a non-negative integer'
    })
  })
})
