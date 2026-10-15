import { describe, it, expect } from 'vitest'
import { buildBarMenu, buildBookmarkMenu, type BookmarkMenuEntry } from './bookmark-menu'
import type { BookmarkNode } from './bookmark-store'

const labels = (menu: BookmarkMenuEntry[]): string[] =>
  menu.map((e) => (e.type === 'separator' ? '—' : e.label))

const entry = (menu: BookmarkMenuEntry[], label: string): BookmarkMenuEntry | undefined =>
  menu.find((e) => e.type !== 'separator' && e.label === label)

const url: BookmarkNode = { id: 'a', kind: 'url', title: 'A', url: 'https://a.test/' }

const folder = (n: number): BookmarkNode => ({
  id: 'f',
  kind: 'folder',
  title: 'Dev',
  children: Array.from({ length: n }, (_, i) => ({
    id: `u${i}`,
    kind: 'url' as const,
    title: `U${i}`,
    url: `https://u${i}.test/`
  }))
})

describe('buildBookmarkMenu', () => {
  it("lays a favorite's menu out like Chrome's", () => {
    expect(labels(buildBookmarkMenu(url))).toEqual([
      'Open in New Tab',
      'Open in New Window',
      '—',
      'Edit…',
      '—',
      'Cut',
      'Copy',
      'Paste',
      '—',
      'Delete',
      '—',
      'Add Page…',
      'Add Folder…',
      '—',
      'Bookmarks Bar'
    ])
  })

  it('wires each entry to its command, inserting after the item', () => {
    const menu = buildBookmarkMenu(url, { canPaste: true, barVisible: true })
    expect(entry(menu, 'Open in New Tab')).toMatchObject({
      command: 'navigate',
      params: { url: 'https://a.test/', newTab: true }
    })
    expect(entry(menu, 'Open in New Window')).toMatchObject({
      command: 'open-bookmarks-in-new-window',
      params: { id: 'a' }
    })
    expect(entry(menu, 'Edit…')).toMatchObject({
      command: 'show-bookmark-editor',
      params: { mode: 'edit', id: 'a' }
    })
    expect(entry(menu, 'Cut')).toMatchObject({ command: 'cut-bookmark', params: { id: 'a' } })
    expect(entry(menu, 'Paste')).toMatchObject({
      command: 'paste-bookmark',
      params: { afterId: 'a' },
      enabled: true
    })
    expect(entry(menu, 'Add Folder…')).toMatchObject({
      params: { mode: 'add-folder', afterId: 'a' }
    })
    expect(entry(menu, 'Delete')).toMatchObject({ command: 'remove-bookmark', params: { id: 'a' } })
  })

  it('greys Paste out with nothing to paste, and ticks the bar state', () => {
    const menu = buildBookmarkMenu(url, { canPaste: false, barVisible: true })
    expect(entry(menu, 'Paste')).toMatchObject({ enabled: false })
    const bar = entry(menu, 'Bookmarks Bar')
    expect(bar?.type === 'submenu' && bar.items).toEqual([
      expect.objectContaining({ label: 'Always Show', checked: true, params: { visible: true } }),
      expect.objectContaining({ label: 'Always Hide', checked: false, params: { visible: false } })
    ])
  })

  it('offers Open All on a folder, counted, and Rename… instead of Edit…', () => {
    const menu = buildBookmarkMenu(folder(2))
    expect(labels(menu).slice(0, 4)).toEqual([
      'Open All (2)',
      'Open All in New Window (2)',
      '—',
      'Rename…'
    ])
    expect(entry(menu, 'Open All (2)')).toMatchObject({
      command: 'open-all-bookmarks',
      params: { id: 'f' },
      enabled: true
    })
    expect(entry(menu, 'Open All (2)')).not.toHaveProperty('confirm')
  })

  it('greys Open All out on an empty folder and asks above 15 tabs', () => {
    expect(entry(buildBookmarkMenu(folder(0)), 'Open All')).toMatchObject({ enabled: false })
    expect(entry(buildBookmarkMenu(folder(16)), 'Open All (16)')).toMatchObject({
      confirm: { message: 'Open 16 tabs?', button: 'Open' }
    })
  })

  it('asks before deleting a folder that holds bookmarks, counting nested ones', () => {
    const menu = buildBookmarkMenu({
      id: 'f',
      kind: 'folder',
      title: 'Dev',
      children: [
        { id: 'a', kind: 'url', title: 'A', url: 'https://a.test/' },
        {
          id: 'g',
          kind: 'folder',
          title: 'Sub',
          children: [{ id: 'b', kind: 'url', title: 'B', url: 'https://b.test/' }]
        }
      ]
    })
    expect(entry(menu, 'Delete')).toMatchObject({
      confirm: {
        message: 'Delete the folder “Dev”?',
        detail: 'It holds 2 bookmarks, deleted with it.'
      }
    })
  })

  it('deletes an empty folder without asking', () => {
    expect(entry(buildBookmarkMenu(folder(0)), 'Delete')).not.toHaveProperty('confirm')
  })
})

describe('buildBarMenu', () => {
  it('offers add / paste / bar visibility, inserting at the end of the bar', () => {
    const menu = buildBarMenu({ canPaste: true, barVisible: true })
    expect(labels(menu)).toEqual(['Add Page…', 'Add Folder…', '—', 'Paste', '—', 'Bookmarks Bar'])
    expect(entry(menu, 'Add Page…')).toMatchObject({ params: { mode: 'add-page' } })
    expect(entry(menu, 'Paste')).toMatchObject({ params: {}, enabled: true })
  })
})
