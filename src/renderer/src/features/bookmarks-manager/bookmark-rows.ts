// Settings → Bookmarks (Linux fork): the favorites tree flattened into rows that
// can be searched, filtered and sorted. Pure, so it is unit-tested; the section
// component only renders what this returns.

export interface BookmarkNodeLike {
  id: string
  kind: 'url' | 'folder'
  title: string
  url?: string
  createdAt?: number
  children?: BookmarkNodeLike[]
}

export interface BookmarkRow {
  id: string
  kind: 'url' | 'folder'
  title: string
  url: string
  /** Titles of the folders above it, outermost first (empty at the top level). */
  path: string[]
  /** Ids of those folders, same order: lets a folder filter keep its subtree. */
  ancestors: string[]
  createdAt?: number
  /** Position in the tree (depth-first): the "Bar order" sort. */
  order: number
  /** How many favorites share this url (1 = unique; always 1 for a folder). */
  copies: number
  /** Urls under a folder (0 for a favorite). */
  size: number
}

export type BookmarkSort = 'newest' | 'oldest' | 'title' | 'tree'
export type BookmarkFilter = 'all' | 'urls' | 'folders' | 'duplicates' | 'undated'

export function bookmarkRows(tree: BookmarkNodeLike[]): BookmarkRow[] {
  const rows: BookmarkRow[] = []
  const walk = (nodes: BookmarkNodeLike[], path: string[], ancestors: string[]): number => {
    let urls = 0
    for (const node of nodes) {
      const row: BookmarkRow = {
        id: node.id,
        kind: node.kind,
        title: node.title,
        url: node.kind === 'url' ? (node.url ?? '') : '',
        path,
        ancestors,
        ...(node.createdAt !== undefined ? { createdAt: node.createdAt } : {}),
        order: rows.length,
        copies: 1,
        size: 0
      }
      rows.push(row)
      if (node.kind === 'folder') {
        row.size = walk(
          node.children ?? [],
          [...path, node.title || 'Untitled folder'],
          [...ancestors, node.id]
        )
        urls += row.size
      } else {
        urls++
      }
    }
    return urls
  }
  walk(tree, [], [])
  const counts = new Map<string, number>()
  for (const r of rows) if (r.kind === 'url') counts.set(r.url, (counts.get(r.url) ?? 0) + 1)
  for (const r of rows) if (r.kind === 'url') r.copies = counts.get(r.url) ?? 1
  return rows
}

/** Lower case, accents dropped: "Été" finds "ete" and the other way round. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export interface BookmarkQuery {
  text?: string
  filter?: BookmarkFilter
  sort?: BookmarkSort
  /** Only what lies inside this folder (at any depth). */
  folderId?: string
}

/** Rows matching every word of `text` (in the title, the url or a folder name),
 * the filter and the folder, in the asked order. Undated rows go last in a date
 * sort; ties keep the tree order. */
export function queryBookmarks(rows: BookmarkRow[], q: BookmarkQuery): BookmarkRow[] {
  const words = fold(q.text ?? '')
    .split(/\s+/)
    .filter(Boolean)
  const filter = q.filter ?? 'all'
  const out = rows.filter((r) => {
    if (q.folderId && !r.ancestors.includes(q.folderId)) return false
    if (filter === 'urls' && r.kind !== 'url') return false
    if (filter === 'folders' && r.kind !== 'folder') return false
    if (filter === 'duplicates' && r.copies < 2) return false
    if (filter === 'undated' && r.createdAt !== undefined) return false
    if (words.length === 0) return true
    const hay = fold(`${r.title} ${r.url} ${r.path.join(' ')}`)
    return words.every((w) => hay.includes(w))
  })
  const sort = q.sort ?? 'newest'
  const byOrder = (a: BookmarkRow, b: BookmarkRow): number => a.order - b.order
  if (sort === 'tree') return out.sort(byOrder)
  if (sort === 'title') {
    return out.sort((a, b) => a.title.localeCompare(b.title) || byOrder(a, b))
  }
  if (filter === 'duplicates') {
    // Copies of the same url side by side, whatever the date says.
    return out.sort((a, b) => a.url.localeCompare(b.url) || byOrder(a, b))
  }
  const sign = sort === 'newest' ? -1 : 1
  return out.sort((a, b) => {
    if (a.createdAt === undefined || b.createdAt === undefined) {
      if (a.createdAt === b.createdAt) return byOrder(a, b)
      return a.createdAt === undefined ? 1 : -1
    }
    return sign * (a.createdAt - b.createdAt) || byOrder(a, b)
  })
}

/** The host shown under a title, without "www.". */
export function bookmarkHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}
