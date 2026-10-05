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
 * while the active tab's view covers it. Never while a chrome overlay is open.
 *
 * A waking tab (just materialized, nothing painted yet) stays hidden: its view
 * draws nothing until the page's first paint, so showing it would let whatever
 * sits beneath show through. The chrome draws a spinner in its place, and since
 * it covers nothing yet, `activeHasView` must be false for the others then. */
export function viewShown(opts: {
  isActive: boolean
  underlaid: boolean
  activeHasView: boolean
  overlayOpen: boolean
  waking?: boolean
}): boolean {
  if (opts.overlayOpen || opts.waking) return false
  if (opts.isActive) return true
  return opts.underlaid && opts.activeHasView
}

/** Whether the underlays still hold after a layout. They were made to sit under
 * ONE active tab; once the user selects another, they go. Kept forever, an
 * underlaid page showed through any view that had not painted yet — a woken tab
 * displayed some other tab's page until its own first paint. */
export function underlaysSurvive(
  madeUnderActiveId: string | null,
  activeId: string | null
): boolean {
  return madeUnderActiveId !== null && madeUnderActiveId === activeId
}
