// Who closed a tab.
//
// 2026-09-26: a tab opened by `mira open` in a session window vanished 7 s later
// with no close command from the session. The main log only had the extension
// layer's `[mira-ext-tab] remove`, which every close path emits alike, so the
// caller could not be named. Each path into closeTabIn now says who it is.
// No URL on purpose: the main log already holds every profile's navigation.

/** Every path that closes a tab (the argument closeTabIn logs). */
export type TabCloseReason =
  | 'close-tab' // `close-tab` by id: socket, MCP, CLI
  | 'close-active-tab' // Cmd+W, the menu, or `close-active-tab` on the bus
  | 'extension' // an extension called chrome.tabs.remove
  | 'forget-domain' // forget-this-site closes the tab before wiping

/** One `[mira-tab] close` log line. Pure. */
export function formatTabCloseLog(opts: {
  reason: TabCloseReason
  tabId: string
  windowId: string
  origin?: string
}): string {
  const origin = opts.origin ? ` origin=${opts.origin}` : ''
  return `[mira-tab] close tab=${opts.tabId} window=${opts.windowId} reason=${opts.reason}${origin}`
}
