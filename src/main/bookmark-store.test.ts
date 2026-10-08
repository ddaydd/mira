import { describe, it, expect } from 'vitest'
import {
  emptyTree,
  insertNode,
  removeNode,
  renameNode,
  moveNode,
  findNode,
  findUrl,
  flatten,
  normalizeBookmarks,
  importAtlasTree,
  importChromeTree,
  type BookmarkNode
} from './bookmark-store'

const url = (id: string, u: string): BookmarkNode => ({ id, kind: 'url', title: u, url: u })
const folder = (id: string, children: BookmarkNode[] = []): BookmarkNode => ({
  id,
  kind: 'folder',
  title: id,
  children
})

describe('tree ops', () => {
  it('inserts at the top level and into a folder', () => {
    let tree = emptyTree()
    tree = insertNode(tree, null, folder('f'))
    tree = insertNode(tree, 'f', url('a', 'https://a.com'))
    expect(findNode(tree, 'a')).toMatchObject({ url: 'https://a.com' })
    expect(flatten(tree).map((n) => n.id)).toEqual(['a'])
  })

  it('throws inserting under a non-folder', () => {
    const tree = insertNode(emptyTree(), null, url('a', 'https://a.com'))
    expect(() => insertNode(tree, 'a', url('b', 'https://b.com'))).toThrow()
  })

  it('removes a folder with its subtree', () => {
    let tree = insertNode(emptyTree(), null, folder('f', [url('a', 'https://a.com')]))
    tree = removeNode(tree, 'f')
    expect(tree).toHaveLength(0)
  })

  it('renames a node', () => {
    let tree = insertNode(emptyTree(), null, url('a', 'https://a.com'))
    tree = renameNode(tree, 'a', 'Alpha')
    expect(findNode(tree, 'a')?.title).toBe('Alpha')
  })

  it('moves a node between folders and refuses a cycle', () => {
    let tree = emptyTree()
    tree = insertNode(tree, null, folder('f1'))
    tree = insertNode(tree, null, folder('f2'))
    tree = insertNode(tree, 'f1', url('a', 'https://a.com'))
    tree = moveNode(tree, 'a', 'f2')
    const f2 = findNode(tree, 'f2')
    expect(f2?.kind === 'folder' && f2.children.map((c) => c.id)).toEqual(['a'])
    // f1 can't move into its own (now nothing) — but a folder into itself must throw.
    expect(() => moveNode(tree, 'f2', 'f2')).toThrow()
  })

  it('findUrl locates a url anywhere in the tree', () => {
    const tree = insertNode(emptyTree(), null, folder('f', [url('a', 'https://deep.com')]))
    expect(findUrl(tree, 'https://deep.com')?.id).toBe('a')
    expect(findUrl(tree, 'https://missing.com')).toBeUndefined()
  })
})

describe('normalizeBookmarks', () => {
  it('keeps well-formed nodes, drops bad ones and duplicate ids', () => {
    const raw = [
      { id: 'a', kind: 'url', title: 'A', url: 'https://a.com' },
      { id: 'a', kind: 'url', title: 'dup', url: 'https://dup.com' }, // duplicate id → dropped
      { id: '', kind: 'url', url: 'https://empty-id.com' }, // empty id → dropped
      { id: 'u2', kind: 'url', url: '' }, // empty url → dropped
      { id: 'f', kind: 'folder', title: 'F', children: [{ id: 'b', url: 'https://b.com' }] }
    ]
    const tree = normalizeBookmarks(raw)
    expect(tree.map((n) => n.id)).toEqual(['a', 'f'])
    expect(flatten(tree).map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('degrades a non-array to an empty tree', () => {
    expect(normalizeBookmarks('nope')).toEqual([])
    expect(normalizeBookmarks(null)).toEqual([])
  })
})

describe('importAtlasTree', () => {
  // A slice mirroring the verified Atlas BookmarkBar shape (see track.md).
  const atlas = {
    uuid: 'root',
    title: '',
    type: { bookmarkBar: {} },
    children: [
      {
        id: 5,
        uuid: 'u-5',
        title: 'Ingram',
        type: { url: {} },
        url: 'https://ingrammicro.com',
        children: [],
        parentUUID: 'root'
      },
      {
        id: 9,
        uuid: 'f-acme',
        title: 'acme',
        type: { folder: {} },
        parentUUID: 'root',
        children: [
          {
            id: 11,
            uuid: 'u-11',
            title: 'Privacy',
            type: { url: {} },
            url: 'https://acme.com/privacy-policy',
            children: [],
            parentUUID: 'f-acme'
          }
        ]
      }
    ]
  }

  it('maps Atlas type objects to our discriminated union, reusing uuids', () => {
    const tree = importAtlasTree(atlas)
    expect(tree.map((n) => ({ id: n.id, kind: n.kind, title: n.title }))).toEqual([
      { id: 'u-5', kind: 'url', title: 'Ingram' },
      { id: 'f-acme', kind: 'folder', title: 'acme' }
    ])
    // The root itself is unwrapped; its children become the top level.
    expect(flatten(tree).map((n) => n.url)).toEqual([
      'https://ingrammicro.com',
      'https://acme.com/privacy-policy'
    ])
  })

  it('accepts a bare children array too, and skips malformed nodes', () => {
    const tree = importAtlasTree([
      { uuid: 'ok', title: 'ok', type: { url: {} }, url: 'https://ok.com' },
      { uuid: '', title: 'no id', type: { url: {} }, url: 'https://x.com' },
      { uuid: 'nourl', title: 'no url', type: { url: {} } }
    ])
    expect(tree.map((n) => n.id)).toEqual(['ok'])
  })
})

describe('importChromeTree', () => {
  // The shape of <User Data>/<profile>/Bookmarks, trimmed to what we read.
  const chrome = {
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: 'Bookmarks bar',
        children: [
          { type: 'url', name: 'Dayd', url: 'https://dayd.fr/' },
          {
            type: 'folder',
            name: 'Dev',
            children: [{ type: 'url', name: 'MDN', url: 'https://developer.mozilla.org/' }]
          },
          { type: 'url', name: 'no url' },
          { type: 'separator', name: 'unknown kind' }
        ]
      },
      other: {
        type: 'folder',
        name: 'Autres favoris',
        children: [{ type: 'url', name: 'Other', url: 'https://o.test/' }]
      },
      synced: { type: 'folder', name: 'Favoris sur mobile', children: [] }
    }
  }
  const counter = (): (() => string) => {
    let n = 0
    return () => `id-${++n}`
  }

  it('puts the bar first, then non-empty Other / Mobile roots as folders', () => {
    const tree = importChromeTree(chrome, counter())
    expect(tree.map((n) => n.title)).toEqual(['Dayd', 'Dev', 'Autres favoris'])
    expect(tree[1]).toMatchObject({
      kind: 'folder',
      children: [{ kind: 'url', title: 'MDN', url: 'https://developer.mozilla.org/' }]
    })
  })

  it('mints a fresh id per node instead of reusing Chrome ids', () => {
    const ids = flatten(importChromeTree(chrome, counter())).map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.startsWith('id-'))).toBe(true)
  })

  it('names an unnamed root by its Chrome default', () => {
    const raw = { roots: { other: { children: [{ type: 'url', name: 'x', url: 'https://x' }] } } }
    expect(importChromeTree(raw, counter())[0].title).toBe('Other bookmarks')
  })

  it('returns an empty tree for anything that is not a Bookmarks file', () => {
    expect(importChromeTree(null, counter())).toEqual([])
    expect(importChromeTree({ nope: 1 }, counter())).toEqual([])
  })
})
