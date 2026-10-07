// What happens to a window when its last tab closes.

import type { CommandOrigin } from './foreground-policy'
import type { TabCloseReason } from './tab-close-log'

/** Whether closing the LAST tab of a window should close the window itself.
 *
 * A secondary (torn-off) window always closes: it is frameless, its state lives
 * in the profile's other windows, and nothing else would dismiss it.
 *
 * The profile's SOLE window closes too when the user closed that tab (Cmd+W or
 * the tab's close button), like Chrome: an empty window has nothing to show. The
 * close is a normal user close, so on the app's last window it asks the same
 * quit question as Cmd+Q.
 *
 * Anything else (a script, an extension, forget-this-site) leaves the sole window
 * open on an empty home: a program must never take down the user's window, nor
 * quit Mira, as a side effect of closing a tab. Pure. */
export function lastTabClosesWindow(opts: {
  reason: TabCloseReason
  origin?: CommandOrigin
  profileWindowCount: number
}): boolean {
  if (opts.profileWindowCount > 1) return true
  const userClose = opts.reason === 'close-tab' || opts.reason === 'close-active-tab'
  return userClose && opts.origin === 'ui'
}
