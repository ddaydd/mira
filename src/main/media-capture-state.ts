// Camera / microphone state per tab — the logic behind the address-bar camera
// button (Chrome's "this site is using your camera" icon, which Electron does not
// ship: it embeds Chromium's engine, not Chrome's UI).
//
// Two sources feed it:
//   1. the getUserMedia shim (media-device-picker-shim.ts), which reports, per
//      frame, the labels of the capture tracks still live in that frame;
//   2. the device picker (media-device-picker-service.ts): Cancel there is what
//      a page sees as "Block" in Chrome, so the tab is flagged `blocked` until its
//      next navigation. A page told NotAllowedError usually stops asking and tells
//      the user to fix the permission next to the address bar — this is that place.
//
// The button's menu offers one way out: reset the tab (clear the block, force the
// picker on the next request even when the page pins its own device) and reload.
//
// Pure and keyed by webContents id: profiles.ts maps ids to tabs and does the
// native parts (popup, reload). Split for testability ("tout testable").

/** Shim → main (send): one frame's live capture tracks, a FrameCapture. */
export const MEDIA_CAPTURE_REPORT_CHANNEL = 'mira:media-capture-report'
/** Shim → main (invoke): should the picker show although the page pinned its
 * device? True once after the user chose "Choose devices again". */
export const MEDIA_FORCE_PICK_CHANNEL = 'mira:media-force-pick'

/** What one frame is capturing: the labels of its live tracks, per kind. */
export interface FrameCapture {
  video: string[]
  audio: string[]
}

/** A tab's capture state, as TabInfo carries it to the chrome. */
export interface MediaCaptureInfo {
  /** A live camera track exists in the tab. */
  camera: boolean
  /** A live microphone track exists in the tab. */
  microphone: boolean
  /** The user cancelled the device picker on this page (Chrome's "Block"). */
  blocked: boolean
  /** Labels of the devices in use ('' when the OS gave none), deduped. */
  cameraLabels: string[]
  microphoneLabels: string[]
}

/** Coerce the untrusted report (it crosses from a web page's main world) into a
 * FrameCapture, dropping anything malformed. Pure. */
export function normalizeCaptureReport(payload: unknown): FrameCapture {
  const p = (payload ?? {}) as { video?: unknown; audio?: unknown }
  const labels = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? raw.slice(0, 16).map((l) => (typeof l === 'string' ? l.slice(0, 200) : ''))
      : []
  return { video: labels(p.video), audio: labels(p.audio) }
}

interface ContentsCapture {
  frames: Map<string, FrameCapture>
  blocked: boolean
  forcePick: boolean
}

export class MediaCaptureTracker {
  private readonly byContents = new Map<number, ContentsCapture>()

  private entry(wcId: number): ContentsCapture {
    let e = this.byContents.get(wcId)
    if (!e) {
      e = { frames: new Map(), blocked: false, forcePick: false }
      this.byContents.set(wcId, e)
    }
    return e
  }

  /** Record what one frame captures now (replaces its previous report). */
  report(wcId: number, frameKey: string, capture: FrameCapture): void {
    const e = this.entry(wcId)
    if (capture.video.length === 0 && capture.audio.length === 0) e.frames.delete(frameKey)
    else e.frames.set(frameKey, capture)
    // A capture that started means the page got its devices: no longer blocked.
    if (capture.video.length > 0 || capture.audio.length > 0) e.blocked = false
  }

  /** The user cancelled the picker for this page. */
  markBlocked(wcId: number): void {
    this.entry(wcId).blocked = true
  }

  /** A new document in the main frame: every frame's tracks died with the old
   * one, and a block applied to that page only. `forcePick` survives — it is armed
   * right before the reload that this reset follows. */
  resetForNavigation(wcId: number): void {
    const e = this.byContents.get(wcId)
    if (!e) return
    e.frames.clear()
    e.blocked = false
    if (!e.forcePick) this.byContents.delete(wcId)
  }

  /** Arm the picker for the next request of this page, even if the page pins its
   * own device, and clear a block. The caller reloads the tab. */
  armForcePick(wcId: number): void {
    const e = this.entry(wcId)
    e.blocked = false
    e.forcePick = true
  }

  /** Read-and-clear the force flag: true once after armForcePick. */
  consumeForcePick(wcId: number): boolean {
    const e = this.byContents.get(wcId)
    if (!e?.forcePick) return false
    e.forcePick = false
    return true
  }

  /** The webContents is gone. */
  forget(wcId: number): void {
    this.byContents.delete(wcId)
  }

  /** The tab's state for the chrome, or null when there is nothing to show. */
  infoFor(wcId: number): MediaCaptureInfo | null {
    const e = this.byContents.get(wcId)
    if (!e) return null
    const video: string[] = []
    const audio: string[] = []
    for (const f of e.frames.values()) {
      video.push(...f.video)
      audio.push(...f.audio)
    }
    if (video.length === 0 && audio.length === 0 && !e.blocked) return null
    return {
      camera: video.length > 0,
      microphone: audio.length > 0,
      blocked: e.blocked,
      cameraLabels: [...new Set(video)],
      microphoneLabels: [...new Set(audio)]
    }
  }
}

/** One entry of the camera button's native menu. */
export type MediaCaptureMenuItem =
  | { type: 'command'; command: string; params: Record<string, unknown>; label: string }
  | { type: 'disabled'; label: string }
  | { type: 'separator' }

/** Decide the camera button's menu for one tab: what is in use (or blocked), then
 * the action that resets the tab and reloads it so the picker shows again. Pure. */
export function buildMediaCaptureMenu(
  tabId: string,
  info: MediaCaptureInfo | null
): MediaCaptureMenuItem[] {
  const items: MediaCaptureMenuItem[] = []
  const list = (labels: string[]): string => labels.filter((l) => l).join(', ')
  if (info?.camera) {
    const l = list(info.cameraLabels)
    items.push({ type: 'disabled', label: l ? `Using camera: ${l}` : 'Using your camera' })
  }
  if (info?.microphone) {
    const l = list(info.microphoneLabels)
    items.push({ type: 'disabled', label: l ? `Using microphone: ${l}` : 'Using your microphone' })
  }
  if (info?.blocked) {
    items.push({ type: 'disabled', label: 'Camera and microphone blocked on this page' })
  }
  if (items.length === 0) {
    items.push({ type: 'disabled', label: 'Not using your camera or microphone' })
  }
  items.push({ type: 'separator' })
  items.push({
    type: 'command',
    command: 'reset-media-capture',
    params: { tabId },
    label: info?.blocked ? 'Allow again and reload' : 'Choose devices again (reloads the page)'
  })
  return items
}
