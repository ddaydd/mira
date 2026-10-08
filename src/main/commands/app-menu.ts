// App-menu domain: one command that pops the whole application menu (File, Edit,
// Bookmarks…) as a dropdown. On macOS that menu lives in the system menu bar; on
// Linux and Windows the window is frameless, so it has no menu bar at all and the
// menus (above all the Bookmarks list) would only be reachable by accelerator.
// The chrome's ☰ button calls this; a socket/MCP client can pop it too.

import { type CommandMap, fail } from './registry'
import type { CommandContext } from './context'

/** App-menu capability slice. `showAppMenu` pops the application menu in the
 * target window, at `at` (window content coordinates) or at the cursor. */
export interface AppMenuContext {
  showAppMenu: (at?: { x: number; y: number }) => void
}

export interface ShowAppMenuParams {
  x?: number
  y?: number
}

export const appMenuCommands: CommandMap<CommandContext> = {
  'show-app-menu': (ctx, params) => {
    const { x, y } = (params ?? {}) as ShowAppMenuParams
    const given = [x, y].filter((v) => v !== undefined)
    if (given.length === 1) return { ok: false, error: '"x" and "y" go together' }
    if (given.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      return { ok: false, error: '"x" and "y" must be finite numbers' }
    }
    try {
      ctx.showAppMenu(given.length === 2 ? { x: Math.round(x!), y: Math.round(y!) } : undefined)
      return { ok: true }
    } catch (error) {
      return fail(error)
    }
  }
}
