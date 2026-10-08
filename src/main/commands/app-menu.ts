// App-menu domain: one command that pops the whole application menu (File, Edit,
// Bookmarks…) as a dropdown. On macOS that menu lives in the system menu bar; on
// Linux and Windows the window is frameless, so it has no menu bar at all and the
// menus (above all the Bookmarks list) would only be reachable by accelerator.
// The chrome's ☰ button calls this; a socket/MCP client can pop it too.

import { type CommandMap, fail } from './registry'
import type { CommandContext } from './context'

/** App-menu capability slice. `showAppMenu` pops the application menu in the
 * target window, at `at` (window content coordinates) or at the cursor. With
 * `align: 'right'`, `at.x` is where the menu's RIGHT edge should land. */
export interface AppMenuContext {
  showAppMenu: (at?: { x: number; y: number }, align?: 'left' | 'right') => void
}

export interface ShowAppMenuParams {
  x?: number
  y?: number
  align?: 'left' | 'right'
}

/** Estimated popup width for a menu whose items carry these labels. Electron's
 * popup only takes a top-left corner and never reports the size it draws, so a
 * right-aligned menu needs a guess: measured on KDE at 145 px for "Bookmarks"
 * (9 chars, plus submenu arrow and padding). Leans wide on purpose — a guess
 * too wide leaves a gap, one too narrow would overflow the window again. */
export function estimateMenuWidth(labels: readonly string[]): number {
  const longest = Math.max(0, ...labels.map((l) => l.length))
  return longest * 8 + 75
}

/** Left x of a popup whose right edge must land on `right`, never left of 0. */
export function rightAlignedX(right: number, menuWidth: number): number {
  return Math.max(0, Math.round(right - menuWidth))
}

export const appMenuCommands: CommandMap<CommandContext> = {
  'show-app-menu': (ctx, params) => {
    const { x, y, align } = (params ?? {}) as ShowAppMenuParams
    if (align !== undefined && align !== 'left' && align !== 'right') {
      return { ok: false, error: '"align" must be "left" or "right"' }
    }
    const given = [x, y].filter((v) => v !== undefined)
    if (given.length === 1) return { ok: false, error: '"x" and "y" go together' }
    if (given.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      return { ok: false, error: '"x" and "y" must be finite numbers' }
    }
    try {
      const at = given.length === 2 ? { x: Math.round(x!), y: Math.round(y!) } : undefined
      ctx.showAppMenu(at, at ? align : undefined)
      return { ok: true }
    } catch (error) {
      return fail(error)
    }
  }
}
