// The editing half of the bookmarks-bar right-click menu, as in Chrome: Edit…
// (title + url), Cut / Copy / Paste, Add Page… / Add Folder…, Open All. Pure tree
// work only — where a paste or an insert lands, what the clipboard holds, a node
// copied without its ids — so it is unit-tested without Electron. The native side
// (profiles.ts) owns ids, the system clipboard and the editor window.

import { type BookmarkNode, type BookmarkTree, findNode, flatten } from './bookmark-store'

/** A node about to be inserted: ids are assigned by whoever stores it. */
export type NewBookmarkNode =
  | { kind: 'url'; title: string; url: string; createdAt?: number }
  | { kind: 'folder'; title: string; children: NewBookmarkNode[]; createdAt?: number }

/** What Copy / Cut left behind. `text` is what went to the system clipboard: a
 * paste only uses the stored node while the clipboard still holds that text, so
 * copying something else in between pastes that instead (Chrome's behaviour). */
export interface BookmarkClip {
  node: NewBookmarkNode
  text: string
}

/** Where a new node goes: right after `afterId` in its own list, or at the end of
 * the bar (top level) when there is no anchor. An unknown anchor falls back to the
 * end of the bar too, rather than failing a paste over a deleted item. */
export function slotAfter(
  tree: BookmarkTree,
  afterId?: string
): { parentId: string | null; index: number } {
  if (afterId !== undefined) {
    const found = locate(tree, afterId, null)
    if (found) return { parentId: found.parentId, index: found.index + 1 }
  }
  return { parentId: null, index: tree.length }
}

function locate(
  list: BookmarkNode[],
  id: string,
  parentId: string | null
): { parentId: string | null; index: number } | null {
  for (let i = 0; i < list.length; i++) {
    const node = list[i]
    if (node.id === id) return { parentId, index: i }
    if (node.kind === 'folder') {
      const found = locate(node.children, id, node.id)
      if (found) return found
    }
  }
  return null
}

/** A node's content without its ids (a whole subtree for a folder). The date
 * travels with it, so a cut + paste keeps when the favorite was added. */
export function withoutIds(node: BookmarkNode): NewBookmarkNode {
  const date = node.createdAt !== undefined ? { createdAt: node.createdAt } : {}
  return node.kind === 'url'
    ? { kind: 'url', title: node.title, url: node.url, ...date }
    : { kind: 'folder', title: node.title, children: node.children.map(withoutIds), ...date }
}

/** Give a new node (and its subtree) ids; a node without a date gets `now`. */
export function withIds(node: NewBookmarkNode, newId: () => string, now?: number): BookmarkNode {
  const createdAt = node.createdAt ?? now
  const date = createdAt !== undefined ? { createdAt } : {}
  return node.kind === 'url'
    ? { id: newId(), kind: 'url', title: node.title, url: node.url, ...date }
    : {
        id: newId(),
        kind: 'folder',
        title: node.title,
        children: node.children.map((c) => withIds(c, newId, now)),
        ...date
      }
}

/** The page urls a node opens: itself, or every favorite under a folder. */
export function urlsOf(node: BookmarkNode): string[] {
  return node.kind === 'url' ? [node.url] : flatten(node.children).map((n) => n.url)
}

/** Copy / Cut of `id`: the clip to keep, and the text for the system clipboard
 * (the url, or a folder's urls one per line). Throws on an unknown id. */
export function clipOf(tree: BookmarkTree, id: string): BookmarkClip {
  const node = findNode(tree, id)
  if (!node) throw new Error(`unknown bookmark: ${id}`)
  return { node: withoutIds(node), text: urlsOf(node).join('\n') }
}

/** A single web address, as Chrome accepts it on Paste. */
function pastableUrl(text: string): string | null {
  const t = text.trim()
  if (t === '' || /\s/.test(t)) return null
  try {
    const u = new URL(t)
    return ['http:', 'https:', 'file:'].includes(u.protocol) ? t : null
  } catch {
    return null
  }
}

/** What Paste would insert: the copied / cut node while the system clipboard
 * still holds its text, else a url copied from anywhere (titled with itself), else
 * nothing (Paste greyed out). */
export function pasteSource(
  clip: BookmarkClip | null,
  clipboardText: string
): NewBookmarkNode | null {
  if (clip && clipboardText === clip.text) return clip.node
  const url = pastableUrl(clipboardText)
  return url ? { kind: 'url', title: url, url } : null
}

/** Patch a node in place: a new title, and for a favorite a new url. Throws on an
 * unknown id, or a url on a folder. */
export function updateNode(
  tree: BookmarkTree,
  id: string,
  patch: { title?: string; url?: string }
): BookmarkTree {
  const node = findNode(tree, id)
  if (!node) throw new Error(`unknown bookmark: ${id}`)
  if (patch.url !== undefined && node.kind !== 'url') throw new Error(`not a url bookmark: ${id}`)
  const apply = (n: BookmarkNode): BookmarkNode => {
    if (n.id === id) {
      const title = patch.title ?? n.title
      return n.kind === 'url' ? { ...n, title, url: patch.url ?? n.url } : { ...n, title }
    }
    return n.kind === 'folder' ? { ...n, children: n.children.map(apply) } : n
  }
  return tree.map(apply)
}
