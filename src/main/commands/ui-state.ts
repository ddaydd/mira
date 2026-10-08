// UI-state domain: one read-only call answering "what is on screen in Mira?" —
// the window, its active tab, and the overlays / panels that are up. See
// ui-state.ts for the shape and the summary text.

import { type CommandMap, fail } from './registry'
import type { CommandContext } from './context'
import { uiStateSummary, type UiState } from '../ui-state'

/** UI-state capability slice. Without `windowId`: the window the USER is on
 * (the focused one, else the last one they focused), never an agent's session
 * window. Throws on an unknown windowId or when no window is open. */
export interface UiStateContext {
  uiState: (windowId?: string) => UiState
}

export const uiStateCommands: CommandMap<CommandContext> = {
  'ui-state': (ctx, params) => {
    const { windowId } = (params ?? {}) as { windowId?: unknown }
    if (windowId !== undefined && (typeof windowId !== 'string' || windowId.trim() === '')) {
      return { ok: false, error: '"windowId" must be a non-empty string' }
    }
    try {
      const state = ctx.uiState(windowId?.trim())
      return { ok: true, ...state, text: uiStateSummary(state) }
    } catch (error) {
      return fail(error)
    }
  }
}
