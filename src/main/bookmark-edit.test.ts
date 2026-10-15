import { describe, it, expect } from 'vitest'
import {
  clipOf,
  pasteSource,
  slotAfter,
  updateNode,
  urlsOf,
  withIds,
  withoutIds
} from './bookmark-edit'
import type { BookmarkTree } from './bookmark-store'

const tree: BookmarkTree = [
  { id: 'a', kind: 'url', title: 'A', url: 'https://a.test/' },
  {
    id: 'f',
    kind: 'folder',
    title: 'Dev',
    children: [
      { id: 'b', kind: 'url', title: 'B', url: 'https://b.test/' },
      { id: 'g', kind: 'folder', title: 'Sub', children: [] }
    ]
  }
]

describe('slotAfter', () => {
  it('lands right after the anchor, in its own folder', () => {
    expect(slotAfter(tree, 'a')).toEqual({ parentId: null, index: 1 })
    expect(slotAfter(tree, 'b')).toEqual({ parentId: 'f', index: 1 })
  })

  it('falls back to the end of the bar', () => {
    expect(slotAfter(tree)).toEqual({ parentId: null, index: 2 })
    expect(slotAfter(tree, 'gone')).toEqual({ parentId: null, index: 2 })
  })
})

describe('ids', () => {
  it('copies a subtree without ids and gives it fresh ones', () => {
    const copy = withoutIds(tree[1])
    expect(copy).toEqual({
      kind: 'folder',
      title: 'Dev',
      children: [
        { kind: 'url', title: 'B', url: 'https://b.test/' },
        { kind: 'folder', title: 'Sub', children: [] }
      ]
    })
    let n = 0
    const stored = withIds(copy, () => `n${++n}`)
    expect(stored).toMatchObject({ id: 'n1', children: [{ id: 'n2' }, { id: 'n3' }] })
  })
})

describe('clipboard', () => {
  it("copies a favorite's url, a folder's urls one per line", () => {
    expect(clipOf(tree, 'a').text).toBe('https://a.test/')
    expect(clipOf(tree, 'f').text).toBe('https://b.test/')
    expect(urlsOf(tree[1])).toEqual(['https://b.test/'])
    expect(() => clipOf(tree, 'nope')).toThrow('unknown bookmark')
  })

  it('pastes the copied node while the clipboard still holds its text', () => {
    const clip = clipOf(tree, 'f')
    expect(pasteSource(clip, 'https://b.test/')).toBe(clip.node)
  })

  it('pastes a url copied elsewhere, titled with itself, and nothing else', () => {
    const clip = clipOf(tree, 'a')
    expect(pasteSource(clip, 'https://other.test/x')).toEqual({
      kind: 'url',
      title: 'https://other.test/x',
      url: 'https://other.test/x'
    })
    expect(pasteSource(null, 'some words')).toBeNull()
    expect(pasteSource(null, 'javascript:alert(1)')).toBeNull()
    expect(pasteSource(null, '')).toBeNull()
  })
})

describe('updateNode', () => {
  it('retitles and re-points a favorite, retitles a folder', () => {
    const next = updateNode(tree, 'b', { title: 'Bee', url: 'https://bee.test/' })
    expect(urlsOf(next[1])).toEqual(['https://bee.test/'])
    expect(updateNode(tree, 'g', { title: 'S' })[1]).toMatchObject({
      children: [{}, { title: 'S' }]
    })
  })

  it('refuses a url on a folder and an unknown id', () => {
    expect(() => updateNode(tree, 'f', { url: 'https://x.test/' })).toThrow('not a url')
    expect(() => updateNode(tree, 'nope', { title: 'x' })).toThrow('unknown bookmark')
  })
})
