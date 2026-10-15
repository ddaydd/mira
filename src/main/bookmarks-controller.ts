// The favorites tree, split out of the ProfileManager god object. It OWNS the
// bookmark tree state and every mutation (add url / add folder / remove / rename /
// move), delegating the actual tree surgery to the pure ops in bookmark-store.ts.
//
// It does NOT know about windows: after each change it persists and calls the
// injected `onChange`, which is where the manager broadcasts the new tree to every
// window's chrome (the address-bar star) and rebuilds the native Bookmarks menu —
// both need the window set / app, which this controller has no business holding.
// The mutation + idempotency + commit logic is pure enough to unit-test with fake
// persist/onChange (see bookmarks-controller.test.ts).

import { randomUUID } from 'crypto'
import {
  type BookmarkTree,
  type BookmarkNode,
  type BookmarkUrl,
  insertNode,
  removeNode,
  renameNode,
  moveNode,
  findNode,
  flatten,
  unwrapFolder,
  findUrl as findBookmarkUrl
} from './bookmark-store'
import { type NewBookmarkNode, slotAfter, updateNode, withIds } from './bookmark-edit'
import { fillDates } from './bookmark-manager'

export interface BookmarksControllerDeps {
  /** The persisted tree at startup. */
  initial: BookmarkTree
  /** Persist the full tree (userData/bookmarks.json). */
  persist: (tree: BookmarkTree) => void
  /** Called with the new tree after EVERY change, so the manager can broadcast it
   * to the windows' chrome and rebuild the native Bookmarks menu. */
  onChange: (tree: BookmarkTree) => void
}

export class BookmarksController {
  private tree: BookmarkTree

  constructor(private readonly deps: BookmarksControllerDeps) {
    this.tree = deps.initial
  }

  /** The current favorites tree (for the native menu and the listBookmarks command). */
  get(): BookmarkTree {
    return this.tree
  }

  /** Add a url favorite under `parentId` (a folder id, or undefined = top level).
   * Idempotent by url — an already-saved page (anywhere in the tree) returns the
   * existing node with created:false and no write. Throws when parentId is unknown
   * or not a folder (insertNode validates before we persist). */
  addUrl(url: string, title: string, parentId?: string): { node: BookmarkNode; created: boolean } {
    const existing = findBookmarkUrl(this.tree, url)
    if (existing) return { node: existing, created: false }
    const node: BookmarkUrl = { id: randomUUID(), kind: 'url', title, url, createdAt: Date.now() }
    this.tree = insertNode(this.tree, parentId ?? null, node)
    this.commit()
    return { node, created: true }
  }

  /** Add an empty folder under `parentId` (or top level). */
  addFolder(title: string, parentId?: string): { node: BookmarkNode } {
    const node: BookmarkNode = {
      id: randomUUID(),
      kind: 'folder',
      title,
      children: [],
      createdAt: Date.now()
    }
    this.tree = insertNode(this.tree, parentId ?? null, node)
    this.commit()
    return { node }
  }

  /** Remove a node (url or folder) by id. Commits only when it existed. */
  remove(id: string): { removed: boolean } {
    const removed = findNode(this.tree, id) !== undefined
    if (removed) {
      this.tree = removeNode(this.tree, id)
      this.commit()
    }
    return { removed }
  }

  /** Relabel a node. Throws (via renameNode) on an unknown id. */
  rename(id: string, title: string): { node: BookmarkNode } {
    this.tree = renameNode(this.tree, id, title)
    this.commit()
    return { node: findNode(this.tree, id)! }
  }

  /** Reparent / reorder a node. Throws (via moveNode) on invalid moves. */
  move(id: string, parentId: string | null, index?: number): { moved: boolean } {
    this.tree = moveNode(this.tree, id, parentId, index)
    this.commit()
    return { moved: true }
  }

  /** Retitle a node, re-point a favorite (the bar menu's Edit…). Throws on an
   * unknown id, or a url on a folder. */
  update(id: string, patch: { title?: string; url?: string }): { node: BookmarkNode } {
    this.tree = updateNode(this.tree, id, patch)
    this.commit()
    return { node: findNode(this.tree, id)! }
  }

  /** Store a new node (subtree included) right after `afterId`, or at the end of
   * the top level. Not deduplicated by url: Paste / Add Page… make a copy. */
  insert(node: NewBookmarkNode, afterId?: string): { node: BookmarkNode } {
    const stored = withIds(node, randomUUID, Date.now())
    const { parentId, index } = slotAfter(this.tree, afterId)
    this.tree = insertNode(this.tree, parentId, stored, index)
    this.commit()
    return { node: stored }
  }

  /** Add a whole subtree in one write: a new top-level folder `title` holding
   * `children` (an import). Not deduplicated by url — an import mirrors its
   * source as-is. Returns the folder and how many urls it brought. */
  importFolder(title: string, children: BookmarkTree): { node: BookmarkNode; urls: number } {
    const node: BookmarkNode = {
      id: randomUUID(),
      kind: 'folder',
      title,
      children,
      createdAt: Date.now()
    }
    this.tree = insertNode(this.tree, null, node)
    this.commit()
    return { node, urls: flatten(children).length }
  }

  /** Dissolve folder `id`: its children take its place. Returns how many nodes
   * moved up. Throws (via unwrapFolder) on an unknown id or a url node. */
  ungroup(id: string): { moved: number } {
    const node = findNode(this.tree, id)
    this.tree = unwrapFolder(this.tree, id)
    this.commit()
    return { moved: node?.kind === 'folder' ? node.children.length : 0 }
  }

  /** The url of a url-favorite by id, for opening it in a tab. Throws on an unknown
   * id or a folder id (the manager turns this into a new tab). */
  urlFor(id: string): string {
    const node = findNode(this.tree, id)
    if (!node) throw new Error(`unknown bookmark: ${id}`)
    if (node.kind !== 'url') throw new Error(`not a url bookmark: ${id}`)
    return node.url
  }

  /** Give undated nodes a date from `dates` (url → ms), first match by url.
   * Returns how many got one; writes only when at least one did. */
  fillDates(dates: Map<string, number>): { filled: number } {
    const { tree, filled } = fillDates(this.tree, dates)
    if (filled > 0) {
      this.tree = tree
      this.commit()
    }
    return { filled }
  }

  /** Persist the tree and notify the manager (broadcast + native menu rebuild).
   * Bookmarks are global, so one change refreshes them all. */
  private commit(): void {
    this.deps.persist(this.tree)
    this.deps.onChange(this.tree)
  }
}
