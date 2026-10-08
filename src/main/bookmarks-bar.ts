// Bookmarks bar: a strip of the top-level favorites under the toolbar, Chrome
// style, off by default (Mira's own model is the Bookmarks menu). The strip is
// React (features/bookmarks-bar); a folder — or the overflow » button — pops a
// NATIVE dropdown, since a DOM menu could not draw over the WebContentsView.
// What lives here is the pure part: the strip height the layout reserves, and
// the dropdown's item list, unit-tested without Electron.

import { findNode, type BookmarkNode, type BookmarkTree } from './bookmark-store'

/** Height (px) of the strip. Must match --bookmarks-bar-height in the renderer
 * CSS (src/renderer/src/assets/bookmarks-bar.css). */
export const BOOKMARKS_BAR_HEIGHT = 30

/** Px the chrome takes above the web view: the toolbar, plus the strip when
 * shown. Zen mode hides both. */
export function topChromeHeight(
  toolbarHeight: number,
  barVisible: boolean,
  chromeHidden: boolean
): number {
  if (chromeHidden) return 0
  return toolbarHeight + (barVisible ? BOOKMARKS_BAR_HEIGHT : 0)
}

/** One dropdown entry: a url to open, a nested folder, or the "(empty)" filler. */
export type BookmarkMenuItem =
  | { type: 'url'; label: string; url: string }
  | { type: 'folder'; label: string; items: BookmarkMenuItem[] }
  | { type: 'empty' }

/** Longest label kept, so a long title does not stretch the dropdown. */
const MAX_LABEL = 60

function label(text: string): string {
  const t = text.trim()
  return t.length > MAX_LABEL ? `${t.slice(0, MAX_LABEL - 1)}…` : t
}

function toItems(nodes: BookmarkNode[]): BookmarkMenuItem[] {
  if (nodes.length === 0) return [{ type: 'empty' }]
  return nodes.map((n) =>
    n.kind === 'folder'
      ? { type: 'folder', label: label(n.title) || 'Untitled', items: toItems(n.children) }
      : { type: 'url', label: label(n.title) || n.url, url: n.url }
  )
}

/** The dropdown for a bar folder (`folderId`) or for the strip's overflow (no
 * folderId: the top level from `fromIndex` on, the items that did not fit).
 * Throws on an unknown id or a url id. */
export function bookmarksMenuItems(
  tree: BookmarkTree,
  folderId?: string,
  fromIndex = 0
): BookmarkMenuItem[] {
  let nodes: BookmarkNode[] = tree
  if (folderId !== undefined) {
    const folder = findNode(tree, folderId)
    if (!folder) throw new Error(`unknown folder: ${folderId}`)
    if (folder.kind !== 'folder') throw new Error(`not a folder: ${folderId}`)
    nodes = folder.children
  }
  return toItems(nodes.slice(Math.max(0, fromIndex)))
}
