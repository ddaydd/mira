// Clipboard domain: put an arbitrary string on the OS clipboard. Backs the page
// right-click "Copy Link Address" (the popup hands it the link's href), and lets a
// socket / MCP client copy text the same way.

import { type CommandMap, fail } from './registry'
import type { CommandContext } from './context'

export const clipboardCommands: CommandMap<CommandContext> = {
  // Refuses an empty or non-string text: copying '' and toasting "Copied!" would
  // flash a lie.
  'copy-text': (ctx, params) => {
    const { text } = (params ?? {}) as { text?: unknown }
    if (typeof text !== 'string' || text === '') {
      return { ok: false, error: '"text" must be a non-empty string' }
    }
    try {
      ctx.writeClipboard(text)
      ctx.showToast('Copied!')
      return { ok: true }
    } catch (error) {
      return fail(error)
    }
  }
}
