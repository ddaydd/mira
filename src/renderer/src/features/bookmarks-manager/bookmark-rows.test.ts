import { describe, expect, it } from 'vitest'
import { bookmarkHost, bookmarkRows, queryBookmarks, type BookmarkNodeLike } from './bookmark-rows'

const tree: BookmarkNodeLike[] = [
  { id: 'gh', kind: 'url', title: 'GitHub', url: 'https://github.com', createdAt: 300 },
  {
    id: 'dev',
    kind: 'folder',
    title: 'Développement',
    children: [
      { id: 'mdn', kind: 'url', title: 'MDN Web Docs', url: 'https://developer.mozilla.org' },
      {
        id: 'js',
        kind: 'folder',
        title: 'JS',
        children: [
          { id: 'gh2', kind: 'url', title: 'Repo', url: 'https://github.com', createdAt: 100 }
        ]
      }
    ]
  },
  { id: 'yt', kind: 'url', title: 'YouTube', url: 'https://www.youtube.com/', createdAt: 200 }
]

const ids = (rows: { id: string }[]): string[] => rows.map((r) => r.id)

describe('bookmarkRows', () => {
  const rows = bookmarkRows(tree)

  it('flattens depth-first with the folder path and ancestors', () => {
    expect(ids(rows)).toEqual(['gh', 'dev', 'mdn', 'js', 'gh2', 'yt'])
    const gh2 = rows.find((r) => r.id === 'gh2')!
    expect(gh2.path).toEqual(['Développement', 'JS'])
    expect(gh2.ancestors).toEqual(['dev', 'js'])
  })

  it('counts copies of a url and the urls under a folder', () => {
    expect(rows.find((r) => r.id === 'gh')!.copies).toBe(2)
    expect(rows.find((r) => r.id === 'yt')!.copies).toBe(1)
    expect(rows.find((r) => r.id === 'dev')!.size).toBe(2)
  })
})

describe('queryBookmarks', () => {
  const rows = bookmarkRows(tree)

  it('sorts newest first by default, undated last in tree order', () => {
    expect(ids(queryBookmarks(rows, {}))).toEqual(['gh', 'yt', 'gh2', 'dev', 'mdn', 'js'])
  })

  it('sorts oldest first, by title, or in bar order', () => {
    expect(ids(queryBookmarks(rows, { sort: 'oldest', filter: 'urls' }))).toEqual([
      'gh2',
      'yt',
      'gh',
      'mdn'
    ])
    expect(ids(queryBookmarks(rows, { sort: 'title', filter: 'urls' }))).toEqual([
      'gh',
      'mdn',
      'gh2',
      'yt'
    ])
    expect(ids(queryBookmarks(rows, { sort: 'tree' }))).toEqual(ids(rows))
  })

  it('matches every word in title, url or folder name, ignoring case and accents', () => {
    expect(ids(queryBookmarks(rows, { text: 'developpement', filter: 'urls' }))).toEqual([
      'gh2',
      'mdn'
    ])
    expect(ids(queryBookmarks(rows, { text: 'GITHUB js' }))).toEqual(['gh2'])
    expect(ids(queryBookmarks(rows, { text: 'mozilla' }))).toEqual(['mdn'])
  })

  it('filters by kind, duplicates, missing date and folder', () => {
    expect(ids(queryBookmarks(rows, { filter: 'folders', sort: 'tree' }))).toEqual(['dev', 'js'])
    expect(ids(queryBookmarks(rows, { filter: 'duplicates' }))).toEqual(['gh', 'gh2'])
    expect(ids(queryBookmarks(rows, { filter: 'undated', sort: 'tree' }))).toEqual([
      'dev',
      'mdn',
      'js'
    ])
    expect(ids(queryBookmarks(rows, { folderId: 'dev', sort: 'tree' }))).toEqual([
      'mdn',
      'js',
      'gh2'
    ])
  })
})

describe('bookmarkHost', () => {
  it('drops www. and survives a non-url', () => {
    expect(bookmarkHost('https://www.youtube.com/watch')).toBe('youtube.com')
    expect(bookmarkHost('not a url')).toBe('not a url')
  })
})
