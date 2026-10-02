// Chromium command-line switches Mira needs at boot, and why each one is there.
// A list rather than calls scattered in index.ts, so a test can pin them: losing
// one of these silently breaks scripted input, and nothing else would notice.

export interface ChromiumSwitch {
  name: string
  value?: string
}

export const CHROMIUM_SWITCHES: readonly ChromiumSwitch[] = [
  // A window entirely covered by another one is "occluded": Chromium hides its
  // web contents, the renderer stops painting and DROPS every CDP input, while
  // press-key / click / type-text answer ok. The user drives Mira from scripts
  // with other apps in front, and a session window is born covered
  // (window-order.ts), so this is the normal case, not an edge.
  //
  // `backgroundThrottling: false` on the tab (materializeTab) was meant to cover
  // it and does not on Electron 44. Measured 2026-10-02 on a dev instance, same
  // covered session window, same probe page: without the switch, no
  // pointerdown / keydown reached the page, `visibilityState` was `hidden` and
  // requestAnimationFrame never fired; with it, the click and the key landed
  // (`isTrusted: true`), the page read `visible` and frames painted.
  { name: 'disable-backgrounding-occluded-windows' }
]

/** Hand every switch to Chromium. Must run before the app is ready. */
export function applyChromiumSwitches(commandLine: {
  appendSwitch: (name: string, value?: string) => void
}): void {
  for (const s of CHROMIUM_SWITCHES) {
    if (s.value === undefined) commandLine.appendSwitch(s.name)
    else commandLine.appendSwitch(s.name, s.value)
  }
}
