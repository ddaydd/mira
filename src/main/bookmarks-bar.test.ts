import { describe, it, expect } from 'vitest'
import { BOOKMARKS_BAR_HEIGHT, bookmarksMenuItems, topChromeHeight } from './bookmarks-bar'
import type { BookmarkTree } from './bookmark-store'

const tree: BookmarkTree = [
  { id: 'a', kind: 'url', title: 'Alpha', url: 'https://a.test/' },
  {
    id: 'f',
    kind: 'folder',
    title: 'Dev',
    children: [
      { id: 'b', kind: 'url', title: '', url: 'https://b.test/' },
      { id: 'g', kind: 'folder', title: '', children: [] }
    ]
  },
  { id: 'c', kind: 'url', title: 'x'.repeat(80), url: 'https://c.test/' }
]

describe('topChromeHeight', () => {
  it('adds the strip under the toolbar only while shown', () => {
    expect(topChromeHeight(48, false, false)).toBe(48)
    expect(topChromeHeight(48, true, false)).toBe(48 + BOOKMARKS_BAR_HEIGHT)
  })

  it('is 0 in zen mode, bar or not', () => {
    expect(topChromeHeight(48, true, true)).toBe(0)
  })
})

describe('bookmarksMenuItems', () => {
  it("lists a folder's children, nesting subfolders and filling empty ones", () => {
    expect(bookmarksMenuItems(tree, 'f')).toEqual([
      { type: 'url', label: 'https://b.test/', url: 'https://b.test/' },
      { type: 'folder', label: 'Untitled', items: [{ type: 'empty' }] }
    ])
  })

  it('lists the top-level tail from fromIndex (the overflow)', () => {
    const items = bookmarksMenuItems(tree, undefined, 2)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'url', url: 'https://c.test/' })
  })

  it('caps a long label', () => {
    const [item] = bookmarksMenuItems(tree, undefined, 2)
    expect(item.type === 'url' && item.label.length).toBe(60)
  })

  it('throws on an unknown id or a url id', () => {
    expect(() => bookmarksMenuItems(tree, 'nope')).toThrow(/unknown folder/)
    expect(() => bookmarksMenuItems(tree, 'a')).toThrow(/not a folder/)
  })
})
