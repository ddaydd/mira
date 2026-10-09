// Closed-windows domain: Chrome's "Reopen closed window". A user window closed by
// hand is kept on a short persisted stack (../closed-windows.ts); these commands
// list it and bring the newest one back with its tabs, folders and geometry.
// Cmd+Shift+T (reopen-closed-tab) also reopens a window when it closed after the
// window's last closed tab.

import { type CommandMap, fail } from './registry'
import type { CommandContext } from './context'

/** Closed-windows capability slice. App-wide (not bound to a target window). */
export interface ClosedWindowsContext {
  /** Reopen the newest closed window (of `profileId`, else of any profile). */
  reopenClosedWindow: (profileId?: string) => {
    reopened: boolean
    windowId?: string
    profileId?: string
    tabs?: number
  }
  /** The closed windows, newest first. */
  listClosedWindows: () => Array<{
    profileId: string
    closedAt: number
    windowId: string
    tabs: number
    titles: string[]
  }>
}

export const closedWindowsCommands: CommandMap<CommandContext> = {
  // params: { profileId?: string }
  'reopen-closed-window': (ctx, params) => {
    const profileId = (params as { profileId?: unknown } | undefined)?.profileId
    if (profileId !== undefined && (typeof profileId !== 'string' || profileId === '')) {
      return { ok: false, error: '"profileId" must be a non-empty string' }
    }
    try {
      return { ok: true, ...ctx.reopenClosedWindow(profileId) }
    } catch (error) {
      return fail(error)
    }
  },
  'list-closed-windows': (ctx) => {
    try {
      return { ok: true, windows: ctx.listClosedWindows() }
    } catch (error) {
      return fail(error)
    }
  }
}
