// Let the pages' last requests leave before Mira exits (Linux fork).
//
// Closing a window closes its tabs (webContents.close() runs the page's
// pagehide/unload), but Mira used to exit ~50 ms after a quit: the requests a
// page sends on its way out (sendBeacon, fetch keepalive) were still queued and
// died with the process. Measured on a dev instance with a local page: a
// navigation delivered its pagehide beacon, a quit delivered nothing. What it
// cost: YouTube never heard that the video was closed, still counted it as
// playing elsewhere, and a relaunch restarted it from 0:00 instead of resuming.
// Chrome keeps such requests alive past the tabs; this holds the exit briefly.

/** The slice of Electron's `app` this needs (a fake in tests). */
export interface QuitGraceApp {
  on(event: 'will-quit', listener: (event: { preventDefault: () => void }) => void): unknown
  exit(code?: number): void
}

export const QUIT_GRACE_MS = 800

/** Hold the first will-quit for `ms`, then exit. Every other will-quit listener
 * still runs (preventDefault only cancels the termination), and app.exit does
 * not emit before-quit/will-quit again. */
export function holdQuitForPageBeacons(
  app: QuitGraceApp,
  ms = QUIT_GRACE_MS,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout
): void {
  let holding = false
  app.on('will-quit', (event) => {
    if (holding) return
    holding = true
    event.preventDefault()
    schedule(() => app.exit(0), ms)
  })
}

/** The slice of a WebContents closePageAsUser needs (a fake in tests). */
export interface ClosablePage {
  isDestroyed(): boolean
  close(): void
  debugger: {
    isAttached(): boolean
    attach(version?: string): void
    sendCommand(method: string): Promise<unknown>
  }
}

/** How long a page gets to run its unload before the bare close(). */
export const PAGE_CLOSE_GRACE_MS = 1000

/** Close a tab's page the way Chrome closes a tab. Electron's close() — with or
 * without waitForBeforeUnload — destroys the page WITHOUT running its pagehide
 * / unload handlers (measured: neither fired, and no beacon arrived), so a page
 * could never send its last request. CDP Page.close takes Chromium's real
 * tab-close path, which runs them; the bare close() stays as the fallback (CDP
 * unavailable, or the page still alive after the grace). */
export function closePageAsUser(
  page: ClosablePage,
  graceMs = PAGE_CLOSE_GRACE_MS,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout
): void {
  if (page.isDestroyed()) return
  const fallback = (): void => {
    if (!page.isDestroyed()) page.close()
  }
  try {
    if (!page.debugger.isAttached()) page.debugger.attach('1.3')
    page.debugger.sendCommand('Page.close').catch(fallback)
    schedule(fallback, graceMs)
  } catch {
    fallback()
  }
}
