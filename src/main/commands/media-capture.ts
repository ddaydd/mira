// Media-capture domain: the address-bar camera button (Chrome's "this site is
// using your camera" icon, absent from Electron). Two commands, so the button
// stays pilotable like everything else: pop its native menu, and reset a tab —
// clear a camera/mic block, force the device picker on the next request (even
// when the page pins its own device) and reload. State and menu logic are pure
// in ../media-capture-state.ts; the popup and the reload are native (profiles.ts).

import { type CommandMap, fail } from './registry'
import type { CommandContext } from './context'

/** Media-capture capability slice. */
export interface MediaCaptureContext {
  /** Pop the camera button's menu for the target window's active tab. */
  showMediaCaptureMenu: () => void
  /** Clear the tab's block, arm the picker, reload. Throws on an unknown or
   * asleep tab. */
  resetMediaCapture: (tabId: string) => void
}

export const mediaCaptureCommands: CommandMap<CommandContext> = {
  'show-media-capture-menu': (ctx) => {
    try {
      ctx.showMediaCaptureMenu()
      return { ok: true }
    } catch (error) {
      return fail(error)
    }
  },
  // params: { tabId: string }
  'reset-media-capture': (ctx, params) => {
    const tabId = (params as { tabId?: unknown } | undefined)?.tabId
    if (typeof tabId !== 'string' || !tabId) {
      return { ok: false, error: '"tabId" must be a non-empty string' }
    }
    try {
      ctx.resetMediaCapture(tabId)
      return { ok: true }
    } catch (error) {
      return fail(error)
    }
  }
}
