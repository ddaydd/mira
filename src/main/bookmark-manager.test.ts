import { describe, expect, it } from 'vitest'
import { chromeUrlDates, fillDates } from './bookmark-manager'
import { chromeDate, importChromeTree, normalizeBookmarks } from './bookmark-store'
import { withIds, withoutIds } from './bookmark-edit'

// 2024-03-01T00:00:00Z in Chrome's clock (µs since 1601-01-01).
const MARCH_2024 = Date.UTC(2024, 2, 1)
const chromeTime = (ms: number): string => String((ms + 11_644_473_600_000) * 1000)

describe('chromeDate', () => {
  it('converts Chrome microseconds since 1601 to Unix ms', () => {
    expect(chromeDate(chromeTime(MARCH_2024))).toBe(MARCH_2024)
  })
  it('rejects missing, zero and garbage values', () => {
    expect(chromeDate(undefined)).toBeUndefined()
    expect(chromeDate('0')).toBeUndefined()
    expect(chromeDate('abc')).toBeUndefined()
  })
})

describe('createdAt in the model', () => {
  it('survives normalization and drops invalid values', () => {
    const tree = normalizeBookmarks([
      { id: 'a', kind: 'url', title: 'A', url: 'https://a', createdAt: 5 },
      { id: 'b', kind: 'url', title: 'B', url: 'https://b', createdAt: 'x' },
      { id: 'f', kind: 'folder', title: 'F', children: [], createdAt: 7 }
    ])
    expect(tree[0]).toMatchObject({ createdAt: 5 })
    expect('createdAt' in tree[1]).toBe(false)
    expect(tree[2]).toMatchObject({ createdAt: 7 })
  })

  it('comes from date_added on a Chrome import', () => {
    let n = 0
    const tree = importChromeTree(
      {
        roots: {
          bookmark_bar: {
            children: [
              { type: 'url', name: 'A', url: 'https://a', date_added: chromeTime(MARCH_2024) }
            ]
          }
        }
      },
      () => `id${n++}`
    )
    expect(tree[0]).toMatchObject({ url: 'https://a', createdAt: MARCH_2024 })
  })

  it('travels through copy / paste, and a node without one gets now', () => {
    const copied = withoutIds({ id: 'a', kind: 'url', title: 'A', url: 'https://a', createdAt: 5 })
    expect(withIds(copied, () => 'z', 99)).toMatchObject({ id: 'z', createdAt: 5 })
    expect(withIds({ kind: 'url', title: 'B', url: 'https://b' }, () => 'y', 99)).toMatchObject({
      createdAt: 99
    })
  })
})

describe('chromeUrlDates', () => {
  it('walks every root and keeps the oldest date of a url saved twice', () => {
    const dates = chromeUrlDates({
      roots: {
        bookmark_bar: {
          children: [
            { type: 'url', url: 'https://a', date_added: chromeTime(200) },
            {
              type: 'folder',
              children: [{ type: 'url', url: 'https://a', date_added: chromeTime(100) }]
            }
          ]
        },
        other: { children: [{ type: 'url', url: 'https://b', date_added: chromeTime(300) }] }
      }
    })
    expect(dates.get('https://a')).toBe(100)
    expect(dates.get('https://b')).toBe(300)
  })
  it('returns nothing for a file without roots', () => {
    expect(chromeUrlDates(null).size).toBe(0)
  })
})

describe('fillDates', () => {
  it('dates undated favorites by url and their folder by the oldest inside', () => {
    const { tree, filled } = fillDates(
      [
        { id: 'k', kind: 'url', title: 'Kept', url: 'https://a', createdAt: 1 },
        {
          id: 'f',
          kind: 'folder',
          title: 'F',
          children: [
            { id: 'a', kind: 'url', title: 'A', url: 'https://a' },
            { id: 'b', kind: 'url', title: 'B', url: 'https://b' },
            { id: 'c', kind: 'url', title: 'C', url: 'https://unknown' }
          ]
        }
      ],
      new Map([
        ['https://a', 50],
        ['https://b', 40]
      ])
    )
    expect(filled).toBe(3)
    expect(tree[0]).toMatchObject({ createdAt: 1 })
    const folder = tree[1] as { createdAt?: number; children: Array<{ createdAt?: number }> }
    expect(folder.createdAt).toBe(40)
    expect(folder.children.map((c) => c.createdAt)).toEqual([50, 40, undefined])
  })
  it('returns the same tree when nothing matches', () => {
    const tree = [{ id: 'a', kind: 'url' as const, title: 'A', url: 'https://a' }]
    expect(fillDates(tree, new Map())).toEqual({ tree, filled: 0 })
  })
})
