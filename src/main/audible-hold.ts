// The speaker icon of a tab (sidebar row, toolbar audio button, audio menu)
// must not blink between two sentences of a video. Chromium flips
// `isCurrentlyAudible()` off as soon as the stream goes silent, so a speaker who
// pauses for a second toggled the icon off and on (vécu 2026-10-27, YouTube).
// Chrome hides it the same way: its tab indicator keeps the tab "recently
// audible" for 2 s after the sound stops (RecentlyAudibleHelper).
//
// Pure: no Electron, no timers. profiles.ts owns the clock and the re-push once
// the hold is over.

/** How long a tab still counts as audible after its sound stops. */
export const AUDIBLE_HOLD_MS = 2000

/** When each tab last went silent, for the tabs inside their hold. */
export class AudibleHold {
  private readonly silentSince = new Map<string, number>()

  constructor(private readonly holdMs = AUDIBLE_HOLD_MS) {}

  /** Record an audio-state change read from the view. */
  note(tabId: string, audible: boolean, now: number): void {
    if (audible) this.silentSince.delete(tabId)
    else this.silentSince.set(tabId, now)
  }

  /** Audible for the UI: sounding now, or silent for less than the hold. */
  isAudible(tabId: string, live: boolean, now: number): boolean {
    if (live) return true
    const at = this.silentSince.get(tabId)
    if (at === undefined) return false
    if (now - at < this.holdMs) return true
    this.silentSince.delete(tabId)
    return false
  }

  forget(tabId: string): void {
    this.silentSince.delete(tabId)
  }
}
