// How a tab is made ready for real CDP input (press-key, click, type) WITHOUT
// taking the user's tab away from them.
//
// Chromium drops input sent to a page whose view is hidden, so a scripted click
// on a background tab used to select that tab in its window — which switched
// the tab under the user while they were reading another one. Instead, the
// target's view is shown UNDER the active tab's view: same bounds, bottom of the
// z-order, so its renderer is live and takes input while the active tab's view
// covers it entirely. Nothing changes on screen.
//
// That only works when something opaque sits on top. With no native view above
// (the settings tab is drawn by the chrome, and the palette / media gallery hide
// every view to show a chrome overlay), an underlaid page would be drawn over
// the chrome, so those cases keep the old behaviour and select the tab.

export type InputReadiness =
  /** Already the active tab: nothing to do. */
  | 'ready'
  /** Show the tab's view under the active one; the selection does not move. */
  | 'underlay'
  /** Nothing would cover an underlay: select the tab, as before. */
  | 'activate'

export function inputReadiness(opts: {
  isActive: boolean
  /** The active tab is drawn by a native view (false for the settings tab, or
   * when no tab is active). */
  activeHasView: boolean
  /** A chrome overlay (palette, media gallery) currently hides every view. */
  overlayOpen: boolean
}): InputReadiness {
  if (opts.isActive) return 'ready'
  if (!opts.activeHasView || opts.overlayOpen) return 'activate'
  return 'underlay'
}

/** Whether a tab's view is shown by layout: the active tab, or an underlaid one
 * while the active tab's view covers it. Never while a chrome overlay is open. */
export function viewShown(opts: {
  isActive: boolean
  underlaid: boolean
  activeHasView: boolean
  overlayOpen: boolean
}): boolean {
  if (opts.overlayOpen) return false
  if (opts.isActive) return true
  return opts.underlaid && opts.activeHasView
}
