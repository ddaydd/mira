// Bookmarks-bar domain: show/hide the strip of top-level favorites under the
// toolbar, and pop the native dropdown of one of its folders (or of the items
// that overflowed the strip). Both are commands so the bar stays pilotable from
// the socket/MCP, not only by clicking (see bookmarks-bar.ts for the pure part).

import { type CommandMap, fail } from './registry'
import type { CommandContext } from './context'

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

  // Right-click on a bar item: open / new tab / copy / rename / delete.
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
    const { url, title, index } = (params ?? {}) as {
      url?: unknown
      title?: unknown
      index?: unknown
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
    try {
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
