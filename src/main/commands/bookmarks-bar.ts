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
    const given = [x, y].filter((v) => v !== undefined)
    if (given.length === 1) return { ok: false, error: '"x" and "y" go together' }
    if (given.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      return { ok: false, error: '"x" and "y" must be finite numbers' }
    }
    try {
      ctx.showBookmarksMenu({
        ...(folderId !== undefined ? { folderId: folderId.trim() } : {}),
        ...(fromIndex !== undefined ? { fromIndex } : {}),
        ...(given.length === 2 ? { at: { x: Math.round(x!), y: Math.round(y!) } } : {})
      })
      return { ok: true }
    } catch (error) {
      return fail(error)
    }
  }
}
