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

  it('drops a page into a folder, moving a favorite already on the bar', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    registry.execute('add-bookmark-to-bar', { url: 'https://a/' }, ctx)
    const folder = ctx.addFolder('F').node
    ctx.addBookmark('https://in/', 'In', folder.id)
    expect(
      registry.execute('add-bookmark-to-bar', { url: 'https://a/', folderId: folder.id }, ctx)
    ).toMatchObject({ ok: true, created: false, folderId: folder.id })
    expect(
      registry.execute('add-bookmark-to-bar', { url: 'https://new/', folderId: folder.id }, ctx)
    ).toMatchObject({ ok: true, created: true })
    expect(top(ctx)).toEqual(['F'])
    const f = ctx.listBookmarks().tree[0]
    expect(f.kind === 'folder' && f.children.map((n) => (n.kind === 'url' ? n.url : ''))).toEqual([
      'https://in/',
      'https://a/',
      'https://new/'
    ])
  })

  it('refuses a folderId that is not a folder', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    const a = ctx.addBookmark('https://a/').node
    expect(
      registry.execute('add-bookmark-to-bar', { url: 'https://b/', folderId: a.id }, ctx)
    ).toEqual({ ok: false, error: `not a folder: ${a.id}` })
    expect(
      registry.execute('add-bookmark-to-bar', { url: 'https://b/', folderId: '' }, ctx)
    ).toEqual({ ok: false, error: '"folderId" must be a non-empty string' })
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

describe('bookmark-favicons', () => {
  it('maps each url to its icon or null', async () => {
    const { ctx } = makeContext()
    const res = await createCommandRegistry().execute(
      'bookmark-favicons',
      { urls: ['https://known.example/a', 'https://other.example/'] },
      ctx
    )
    expect(res).toEqual({
      ok: true,
      icons: {
        'https://known.example/a': 'https://known.example/i.png',
        'https://other.example/': null
      }
    })
  })

  it('rejects anything but an array of strings', async () => {
    const { ctx } = makeContext()
    expect(await createCommandRegistry().execute('bookmark-favicons', { urls: [1] }, ctx)).toEqual({
      ok: false,
      error: '"urls" must be an array of strings'
    })
  })
})

describe('bookmarks-bar editing (Chrome menu)', () => {
  type Added = { node: { id: string } }
  const setup = (): {
    run: (cmd: string, params?: unknown) => Promise<Record<string, unknown>>
    fake: ReturnType<typeof makeContext>
    ids: { a: string; f: string }
  } => {
    const fake = makeContext()
    const registry = createCommandRegistry()
    const run = async (cmd: string, params: unknown = {}): Promise<Record<string, unknown>> =>
      (await registry.execute(cmd, params, fake.ctx)) as Record<string, unknown>
    const a = registry.execute(
      'add-bookmark',
      { url: 'https://a.test/', title: 'A' },
      fake.ctx
    ) as unknown as Added
    const f = registry.execute('add-folder', { title: 'Dev' }, fake.ctx) as unknown as Added
    return { run, fake, ids: { a: a.node.id, f: f.node.id } }
  }
  const tree = (fake: ReturnType<typeof makeContext>): Array<Record<string, unknown>> =>
    fake.bookmarks() as unknown as Array<Record<string, unknown>>

  it('update-bookmark retitles and re-points, normalizing the url', async () => {
    const { run, fake, ids } = setup()
    expect(await run('update-bookmark', { id: ids.a, title: ' Aa ', url: 'b.test' })).toMatchObject(
      {
        ok: true,
        node: { title: 'Aa', url: 'https://b.test' }
      }
    )
    expect(tree(fake)[0]).toMatchObject({ url: 'https://b.test' })
    expect(await run('update-bookmark', { id: ids.a })).toMatchObject({ ok: false })
    expect(await run('update-bookmark', { id: ids.f, url: 'x.test' })).toMatchObject({ ok: false })
  })

  it('copy then paste duplicates after the anchor; cut then paste moves', async () => {
    const { run, fake, ids } = setup()
    expect(await run('copy-bookmark', { id: ids.a })).toEqual({ ok: true, text: 'https://a.test/' })
    expect(fake.clipboardWrites).toEqual(['https://a.test/'])
    await run('paste-bookmark', { afterId: ids.f })
    expect(tree(fake).map((n) => n.title)).toEqual(['A', 'Dev', 'A'])

    await run('cut-bookmark', { id: ids.a })
    expect(tree(fake).map((n) => n.title)).toEqual(['Dev', 'A'])
    await run('paste-bookmark', {})
    expect(tree(fake).map((n) => n.title)).toEqual(['Dev', 'A', 'A'])
  })

  it('pastes a url copied elsewhere, and says when there is nothing', async () => {
    const { run, fake } = setup()
    expect(await run('paste-bookmark')).toEqual({ ok: false, error: 'nothing to paste' })
    fake.bookmarkEdit.external = 'https://c.test/'
    expect(await run('paste-bookmark')).toMatchObject({
      ok: true,
      node: { kind: 'url', url: 'https://c.test/' }
    })
  })

  it('show-bookmark-editor edits, adds a page (prefilled) and a folder', async () => {
    const { run, fake, ids } = setup()
    fake.bookmarkEdit.editorAnswer = { title: 'Renamed', url: 'https://z.test/' }
    expect(await run('show-bookmark-editor', { mode: 'edit', id: ids.a })).toMatchObject({
      ok: true,
      node: { title: 'Renamed', url: 'https://z.test/' }
    })
    expect(fake.bookmarkEdit.editorRequests[0]).toMatchObject({ mode: 'edit-url', title: 'A' })

    fake.bookmarkEdit.editorAnswer = { title: 'P', url: 'p.test' }
    await run('show-bookmark-editor', { mode: 'add-page', afterId: ids.a })
    expect(tree(fake).map((n) => n.title)).toEqual(['Renamed', 'P', 'Dev'])

    fake.bookmarkEdit.editorAnswer = { title: 'New' }
    await run('show-bookmark-editor', { mode: 'add-folder' })
    expect(tree(fake)[3]).toMatchObject({ kind: 'folder', title: 'New' })

    fake.bookmarkEdit.editorAnswer = null
    expect(await run('show-bookmark-editor', { mode: 'add-folder' })).toEqual({
      ok: true,
      cancelled: true
    })
    expect(await run('show-bookmark-editor', { mode: 'nope' })).toMatchObject({ ok: false })
  })

  it('opens all of a folder in tabs or in a new window', async () => {
    const { run, fake, ids } = setup()
    expect(await run('open-all-bookmarks', { id: ids.f })).toEqual({
      ok: false,
      error: 'no bookmarks to open'
    })
    await run('add-bookmark', { url: 'https://d.test/', parentId: ids.f })
    await run('add-bookmark', { url: 'https://e.test/', parentId: ids.f })
    const opened = await run('open-all-bookmarks', { id: ids.f })
    expect(opened).toMatchObject({ ok: true })
    expect((opened.tabIds as string[]).length).toBe(2)

    expect(await run('open-bookmarks-in-new-window', { id: ids.a })).toMatchObject({
      ok: true,
      count: 1
    })
    await run('open-bookmarks-in-new-window', { id: ids.f })
    expect(fake.bookmarkEdit.newWindows).toEqual([
      ['https://a.test/'],
      ['https://d.test/', 'https://e.test/']
    ])
  })

  it('pops the empty-bar menu', async () => {
    const { run } = setup()
    expect(await run('show-bookmarks-bar-menu', { x: 3, y: 4 })).toEqual({ ok: true })
    expect(await run('show-bookmarks-bar-menu', { x: 3 })).toMatchObject({ ok: false })
  })
})
