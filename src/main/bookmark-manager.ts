// Linux fork: dates for the favorites that predate them. Bookmarks only started
// recording `createdAt` on 2026-10-15; everything imported from Chrome before
// that has none. Chrome kept a `date_added` for each of them, so we match by url
// and copy it over. Pure, so it is unit-tested without Electron or a disk.

import { type BookmarkNode, type BookmarkTree, chromeDate } from './bookmark-store'

interface ChromeNode {
  type?: unknown
  url?: unknown
  date_added?: unknown
  children?: unknown
}

/** Every url of a parsed Chrome `Bookmarks` file with its `date_added` (ms). A
 * url saved several times keeps its OLDEST date: when it was first bookmarked. */
export function chromeUrlDates(chrome: unknown): Map<string, number> {
  const dates = new Map<string, number>()
  const walk = (raw: unknown): void => {
    if (!Array.isArray(raw)) return
    for (const node of raw as ChromeNode[]) {
      if (!node || typeof node !== 'object') continue
      if (node.type === 'url' && typeof node.url === 'string') {
        const at = chromeDate(node.date_added)
        const seen = dates.get(node.url)
        if (at !== undefined && (seen === undefined || at < seen)) dates.set(node.url, at)
      }
      walk(node.children)
    }
  }
  const roots = (chrome as { roots?: Record<string, ChromeNode> } | null)?.roots
  if (roots && typeof roots === 'object') {
    for (const root of Object.values(roots)) walk(root?.children)
  }
  return dates
}

/** Give each undated favorite the date `dates` holds for its url, and each
 * undated folder the oldest date found inside it. Dated nodes are left alone.
 * Returns a new tree and how many nodes got a date. */
export function fillDates(
  tree: BookmarkTree,
  dates: Map<string, number>
): { tree: BookmarkTree; filled: number } {
  let filled = 0
  const visit = (node: BookmarkNode): BookmarkNode => {
    if (node.kind === 'url') {
      if (node.createdAt !== undefined) return node
      const at = dates.get(node.url)
      if (at === undefined) return node
      filled++
      return { ...node, createdAt: at }
    }
    const children = node.children.map(visit)
    if (node.createdAt !== undefined) return { ...node, children }
    const inside = children.map((c) => c.createdAt).filter((d): d is number => d !== undefined)
    if (inside.length === 0) return { ...node, children }
    filled++
    return { ...node, children, createdAt: Math.min(...inside) }
  }
  const out = tree.map(visit)
  return { tree: filled > 0 ? out : tree, filled }
}
