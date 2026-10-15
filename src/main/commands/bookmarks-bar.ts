// Bookmarks-bar domain: show/hide the strip of top-level favorites under the
// toolbar, and pop the native dropdown of one of its folders (or of the items
// that overflowed the strip). Both are commands so the bar stays pilotable from
// the socket/MCP, not only by clicking (see bookmarks-bar.ts for the pure part).

import { type CommandMap, fail } from './registry'
import type { CommandContext } from './context'
import { normalizeInput } from '../url'
import { type BookmarkNode, findNode } from '../bookmark-store'
import {
  type BookmarkClip,
  type NewBookmarkNode,
  clipOf,
  pasteSource,
  urlsOf
} from '../bookmark-edit'
import type {
  BookmarkEditorAnswer,
  BookmarkEditorMode,
  BookmarkEditorRequest
} from '../bookmark-editor'

/** Bookmarks-bar capability slice. */
export interface BookmarksBarContext {
  /** Show / hide the strip (app-wide, persisted); undefined flips it. */
  setBookmarksBarVisible: (visible?: boolean) => { visible: boolean }
  /** Pop the dropdown of folder `folderId`, or of the top level from `fromIndex`
   * on (the overflow), in the target window's profile, at `at` (window content
   * coordinates) or at the cursor. Throws on an unknown / non-folder id. */
  showBookmarksMenu: (options: {
    folderId?: string
    fromIndex?: number
    at?: { x: number; y: number }
  }) => void
  /** Pop the right-click menu of favorite / folder `id` (target window's
   * profile). Throws on an unknown id. */
  showBookmarkMenu: (id: string, at?: { x: number; y: number }) => void
  /** Ask the target window's bar to open its inline title editor on `id`.
   * `editing` is false when the bar is hidden (nothing to edit in). Throws on an
   * unknown id. */
  editBookmark: (id: string) => { editing: boolean }
  /** The icon each page url declares (remembered from visits, else read from
   * the page once), null when unknown (favicon-cache.ts). */
  bookmarkFavicons: (urls: string[]) => Promise<Record<string, string | null>>
  /** Pop the right-click menu of the bar's empty part (Add Page…, Paste…). */
  showBookmarksBarMenu: (at?: { x: number; y: number }) => void
  /** Retitle a node, and re-point a favorite. Throws on an unknown id. */
  updateBookmark: (id: string, patch: { title?: string; url?: string }) => { node: BookmarkNode }
  /** Store a new node (a whole subtree for a folder) right after `afterId`, or
   * at the end of the bar. Not deduplicated by url: a pasted copy is a copy. */
  insertBookmark: (node: NewBookmarkNode, afterId?: string) => { node: BookmarkNode }
  /** What the last Copy / Cut left (app-wide, in memory), null before any. */
  bookmarkClip: () => BookmarkClip | null
  setBookmarkClip: (clip: BookmarkClip) => void
  readClipboard: () => Promise<string>
  /** Title and url of the target window's active tab, to prefill Add Page…. */
  activePage: () => { title: string; url: string } | null
  /** Open `urls` as the tabs of one new window of the target profile. */
  openUrlsInNewWindow: (urls: string[]) => Promise<{ windowId: string }>
  /** The native editor window; null when cancelled. */
  showBookmarkEditor: (req: BookmarkEditorRequest) => Promise<BookmarkEditorAnswer | null>
}

function idParam(params: unknown): string | null {
  const { id } = (params ?? {}) as { id?: unknown }
  return typeof id === 'string' && id.trim() !== '' ? id.trim() : null
}

function afterIdParam(params: unknown): { afterId?: string } | { error: string } {
  const { afterId } = (params ?? {}) as { afterId?: unknown }
  if (afterId === undefined) return {}
  if (typeof afterId !== 'string' || afterId.trim() === '') {
    return { error: '"afterId" must be a non-empty string' }
  }
  return { afterId: afterId.trim() }
}

/** The bookmark `id` of the target profile; throws on an unknown one. */
function nodeOf(ctx: CommandContext, id: string): BookmarkNode {
  const node = findNode(ctx.listBookmarks().tree, id)
  if (!node) throw new Error(`unknown bookmark: ${id}`)
  return node
}

/** Copy, and Cut's first half: remember the node, put its url(s) on the clipboard. */
function copyBookmark(ctx: CommandContext, id: string): BookmarkClip {
  const clip = clipOf(ctx.listBookmarks().tree, id)
  ctx.setBookmarkClip(clip)
  ctx.writeClipboard(clip.text)
  return clip
}

/** Shared x/y validation: both or neither, finite numbers, rounded. */
function position(x: unknown, y: unknown): { at?: { x: number; y: number } } | { error: string } {
  const given = [x, y].filter((v) => v !== undefined)
  if (given.length === 1) return { error: '"x" and "y" go together' }
  if (given.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    return { error: '"x" and "y" must be finite numbers' }
  }
  return given.length === 2
    ? { at: { x: Math.round(x as number), y: Math.round(y as number) } }
    : {}
}

export interface ShowBookmarksMenuParams {
  folderId?: string
  fromIndex?: number
  x?: number
  y?: number
}

export const bookmarksBarCommands: CommandMap<CommandContext> = {
  // View → Show Bookmarks Bar (Ctrl+Shift+B). `visible` omitted → toggle.
  'toggle-bookmarks-bar': (ctx, params) => {
    const { visible } = (params ?? {}) as { visible?: unknown }
    if (visible !== undefined && typeof visible !== 'boolean') {
      return { ok: false, error: '"visible" must be a boolean' }
    }
    try {
      return { ok: true, ...ctx.setBookmarksBarVisible(visible) }
    } catch (error) {
      return fail(error)
    }
  },

  // Right-click on a bar item: Chrome's menu (bookmark-menu.ts).
  'show-bookmark-menu': (ctx, params) => {
    const { id, x, y } = (params ?? {}) as { id?: unknown; x?: unknown; y?: unknown }
    if (typeof id !== 'string' || id.trim() === '') return { ok: false, error: 'missing "id"' }
    const pos = position(x, y)
    if ('error' in pos) return { ok: false, error: pos.error }
    try {
      ctx.showBookmarkMenu(id.trim(), pos.at)
      return { ok: true }
    } catch (error) {
      return fail(error)
    }
  },

  // The menu's Rename…: the bar swaps the item for a text field (Enter commits
  // through rename-bookmark, Escape cancels).
  'edit-bookmark': (ctx, params) => {
    const { id } = (params ?? {}) as { id?: unknown }
    if (typeof id !== 'string' || id.trim() === '') return { ok: false, error: 'missing "id"' }
    try {
      return { ok: true, ...ctx.editBookmark(id.trim()) }
    } catch (error) {
      return fail(error)
    }
  },

  // A page dropped on the bar (the address-bar site icon, a link, a bar item
  // being reordered): bookmark it at top-level `index` (default: the end). An
  // already-bookmarked url is not duplicated: that favorite moves there instead.
  'add-bookmark-to-bar': (ctx, params) => {
    const { url, title, index, folderId } = (params ?? {}) as {
      url?: unknown
      title?: unknown
      index?: unknown
      folderId?: unknown
    }
    if (typeof url !== 'string' || url.trim() === '') return { ok: false, error: 'missing "url"' }
    if (title !== undefined && typeof title !== 'string') {
      return { ok: false, error: '"title" must be a string' }
    }
    if (
      index !== undefined &&
      (typeof index !== 'number' || !Number.isInteger(index) || index < 0)
    ) {
      return { ok: false, error: '"index" must be a non-negative integer' }
    }
    if (folderId !== undefined && (typeof folderId !== 'string' || folderId.trim() === '')) {
      return { ok: false, error: '"folderId" must be a non-empty string' }
    }
    try {
      // Dropped on a folder of the bar: at the end of that folder (an already
      // saved url moves there, as on the bar itself).
      if (typeof folderId === 'string') {
        const folder = nodeOf(ctx, folderId.trim())
        if (folder.kind !== 'folder') throw new Error(`not a folder: ${folder.id}`)
        const { node, created } = ctx.addBookmark(url.trim(), title)
        ctx.moveBookmark(node.id, folder.id)
        return { ok: true, created, node, folderId: folder.id }
      }
      const { node, created } = ctx.addBookmark(url.trim(), title)
      const tree = ctx.listBookmarks().tree
      const to = index === undefined ? tree.length : index
      // Moving detaches first: a favorite already left of the slot shifts it by one.
      const from = tree.findIndex((n) => n.id === node.id)
      ctx.moveBookmark(node.id, null, from !== -1 && from < to ? to - 1 : to)
      return {
        ok: true,
        created,
        node,
        index: ctx.listBookmarks().tree.findIndex((n) => n.id === node.id)
      }
    } catch (error) {
      return fail(error)
    }
  },

  // The bar's icons: what each page declares, not the site's /favicon.ico.
  'bookmark-favicons': async (ctx, params) => {
    const { urls } = (params ?? {}) as { urls?: unknown }
    if (!Array.isArray(urls) || urls.some((u) => typeof u !== 'string')) {
      return { ok: false, error: '"urls" must be an array of strings' }
    }
    try {
      return { ok: true, icons: await ctx.bookmarkFavicons(urls.slice(0, 500) as string[]) }
    } catch (error) {
      return fail(error)
    }
  },

  // Right-click on the bar outside any item.
  'show-bookmarks-bar-menu': (ctx, params) => {
    const { x, y } = (params ?? {}) as { x?: unknown; y?: unknown }
    const pos = position(x, y)
    if ('error' in pos) return { ok: false, error: pos.error }
    try {
      ctx.showBookmarksBarMenu(pos.at)
      return { ok: true }
    } catch (error) {
      return fail(error)
    }
  },

  // Edit…: new title and/or url (a url is normalized like the address bar's).
  'update-bookmark': (ctx, params) => {
    const id = idParam(params)
    if (!id) return { ok: false, error: 'missing "id"' }
    const { title, url } = (params ?? {}) as { title?: unknown; url?: unknown }
    if (title !== undefined && typeof title !== 'string') {
      return { ok: false, error: '"title" must be a string' }
    }
    if (url !== undefined && (typeof url !== 'string' || url.trim() === '')) {
      return { ok: false, error: '"url" must be a non-empty string' }
    }
    if (title === undefined && url === undefined) {
      return { ok: false, error: 'nothing to change: give "title" and/or "url"' }
    }
    try {
      const patch = {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(url !== undefined ? { url: normalizeInput(url) } : {})
      }
      return { ok: true, ...ctx.updateBookmark(id, patch) }
    } catch (error) {
      return fail(error)
    }
  },

  // The menu's Edit… / Rename… / Add Page… / Add Folder…: the native editor, then
  // update-bookmark or an insert after `afterId` (end of the bar without one).
  'show-bookmark-editor': async (ctx, params) => {
    const { mode } = (params ?? {}) as { mode?: unknown }
    if (mode !== 'edit' && mode !== 'add-page' && mode !== 'add-folder') {
      return { ok: false, error: '"mode" must be "edit", "add-page" or "add-folder"' }
    }
    const at = afterIdParam(params)
    if ('error' in at) return { ok: false, error: at.error }
    try {
      if (mode === 'edit') {
        const id = idParam(params)
        if (!id) return { ok: false, error: 'missing "id"' }
        const node = nodeOf(ctx, id)
        const editorMode: BookmarkEditorMode = node.kind === 'url' ? 'edit-url' : 'edit-folder'
        const url = node.kind === 'url' ? node.url : ''
        const answer = await ctx.showBookmarkEditor({ mode: editorMode, title: node.title, url })
        if (!answer) return { ok: true, cancelled: true }
        const patch = {
          title: answer.title,
          ...(answer.url !== undefined ? { url: normalizeInput(answer.url) } : {})
        }
        return { ok: true, ...ctx.updateBookmark(id, patch) }
      }
      if (at.afterId !== undefined) nodeOf(ctx, at.afterId)
      const page = mode === 'add-page' ? ctx.activePage() : null
      const answer = await ctx.showBookmarkEditor({
        mode,
        title: page?.title ?? '',
        url: page?.url ?? ''
      })
      if (!answer) return { ok: true, cancelled: true }
      const node: NewBookmarkNode =
        answer.url !== undefined
          ? { kind: 'url', title: answer.title, url: normalizeInput(answer.url) }
          : { kind: 'folder', title: answer.title, children: [] }
      return { ok: true, ...ctx.insertBookmark(node, at.afterId) }
    } catch (error) {
      return fail(error)
    }
  },

  'copy-bookmark': (ctx, params) => {
    const id = idParam(params)
    if (!id) return { ok: false, error: 'missing "id"' }
    try {
      return { ok: true, text: copyBookmark(ctx, id).text }
    } catch (error) {
      return fail(error)
    }
  },

  // Cut = Copy then Delete; Paste brings the node (a whole folder) back.
  'cut-bookmark': (ctx, params) => {
    const id = idParam(params)
    if (!id) return { ok: false, error: 'missing "id"' }
    try {
      const { text } = copyBookmark(ctx, id)
      ctx.removeBookmark(id)
      return { ok: true, text }
    } catch (error) {
      return fail(error)
    }
  },

  // The copied / cut node while the clipboard still holds its text, else a url
  // copied from anywhere — inserted after `afterId` (end of the bar without one).
  'paste-bookmark': async (ctx, params) => {
    const at = afterIdParam(params)
    if ('error' in at) return { ok: false, error: at.error }
    try {
      const source = pasteSource(ctx.bookmarkClip(), await ctx.readClipboard())
      if (!source) return { ok: false, error: 'nothing to paste' }
      return { ok: true, ...ctx.insertBookmark(source, at.afterId) }
    } catch (error) {
      return fail(error)
    }
  },

  // Open All on a folder: every favorite under it, as background tabs.
  'open-all-bookmarks': (ctx, params) => {
    const id = idParam(params)
    if (!id) return { ok: false, error: 'missing "id"' }
    try {
      const urls = urlsOf(nodeOf(ctx, id))
      if (urls.length === 0) return { ok: false, error: 'no bookmarks to open' }
      const tabIds = urls.map((url) => ctx.newTab(url, true).id)
      return { ok: true, tabIds }
    } catch (error) {
      return fail(error)
    }
  },

  // Open in New Window (a favorite) / Open All in New Window (a folder).
  'open-bookmarks-in-new-window': async (ctx, params) => {
    const id = idParam(params)
    if (!id) return { ok: false, error: 'missing "id"' }
    try {
      const urls = urlsOf(nodeOf(ctx, id))
      if (urls.length === 0) return { ok: false, error: 'no bookmarks to open' }
      return { ok: true, ...(await ctx.openUrlsInNewWindow(urls)), count: urls.length }
    } catch (error) {
      return fail(error)
    }
  },

  'show-bookmarks-menu': (ctx, params) => {
    const { folderId, fromIndex, x, y } = (params ?? {}) as ShowBookmarksMenuParams
    if (folderId !== undefined && (typeof folderId !== 'string' || folderId.trim() === '')) {
      return { ok: false, error: '"folderId" must be a non-empty string' }
    }
    if (
      fromIndex !== undefined &&
      (typeof fromIndex !== 'number' || !Number.isInteger(fromIndex) || fromIndex < 0)
    ) {
      return { ok: false, error: '"fromIndex" must be a non-negative integer' }
    }
    const pos = position(x, y)
    if ('error' in pos) return { ok: false, error: pos.error }
    try {
      ctx.showBookmarksMenu({
        ...(folderId !== undefined ? { folderId: folderId.trim() } : {}),
        ...(fromIndex !== undefined ? { fromIndex } : {}),
        ...pos
      })
      return { ok: true }
    } catch (error) {
      return fail(error)
    }
  }
}
