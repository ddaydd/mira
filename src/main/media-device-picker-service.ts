// Wires the camera/mic picker onto web-page sessions: registers the getUserMedia
// shim as a frame preload (so every page's getUserMedia routes through it) and
// installs the ipcMain handler that shows the native picker when the shim asks.
//
// Same shape as ExtensionCaptureService: pure decisions and rendering live in
// media-device-picker.ts / media-device-picker-shim.ts; this class is the thin
// Electron wiring (on-disk preload, session registration, one global ipc handler).

import { BrowserWindow, ipcMain, type IpcMainEvent, type Session, type WebContents } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEVICE_PICKER_PRELOAD_SOURCE,
  MEDIA_PICK_IPC_CHANNEL,
  showMediaDevicePicker,
  type MediaDevice,
  type MediaPickChoice,
  type MediaPickRequest
} from './media-device-picker'
import { GUM_SHIM_PRELOAD_SOURCE } from './media-device-picker-shim'
import { DeviceMemoryStore } from './media-device-memory'
import {
  MEDIA_CAPTURE_REPORT_CHANNEL,
  MEDIA_FORCE_PICK_CHANNEL,
  normalizeCaptureReport,
  type FrameCapture
} from './media-capture-state'

/** What the camera button needs to hear from the picker and the shim (see
 * media-capture-state.ts). All optional: without them the picker works as before. */
export interface MediaCaptureHooks {
  /** A frame of `wc` reports its live capture tracks. */
  onCapture?: (wc: WebContents, frameKey: string, capture: FrameCapture) => void
  /** A request from `wc` was denied (picker cancelled, or another one was up). */
  onDenied?: (wc: WebContents) => void
  /** Should `wc`'s next pinned request show the picker anyway? Read-and-clear. */
  consumeForcePick?: (wc: WebContents) => boolean
}

/** Coerce the untrusted IPC payload (it crosses from a web page's main world)
 * into a MediaPickRequest, dropping anything malformed. Pure. */
export function normalizePickRequest(payload: unknown): MediaPickRequest {
  const p = (payload ?? {}) as Partial<MediaPickRequest>
  const devices = (raw: unknown, kind: MediaDevice['kind']): MediaDevice[] =>
    Array.isArray(raw)
      ? raw
          .map((d) => d as Partial<MediaDevice>)
          .filter((d) => d && typeof d.deviceId === 'string' && d.deviceId)
          .map((d) => ({ deviceId: d.deviceId as string, label: String(d.label ?? ''), kind }))
      : []
  return {
    origin: typeof p.origin === 'string' ? p.origin : '',
    wantVideo: !!p.wantVideo,
    wantAudio: !!p.wantAudio,
    videoDevices: devices(p.videoDevices, 'videoinput'),
    audioDevices: devices(p.audioDevices, 'audioinput')
  }
}

export class MediaDevicePickerService {
  private shimPreloadPath: string | null = null
  private pickerPreloadPath: string | null = null
  private ipcInstalled = false
  /** One picker at a time — a second request while one is up is denied (cancel),
   * mirroring ExtensionCaptureService.pickerOpen. */
  private pickerOpen = false
  private readonly attached = new WeakSet<Session>()
  /** Linux fork: the devices each site was given, so the picker does not come
   * back on every request (media-device-memory.ts). */
  private readonly memory: DeviceMemoryStore
  /** Pages whose force flag the shim already consumed (pinned-device path): their
   * next pick bypasses the memory, like a fresh "Choose devices again". */
  private readonly forced = new WeakSet<WebContents>()

  constructor(
    private readonly userDataDir: string,
    private readonly hooks: MediaCaptureHooks = {}
  ) {
    this.memory = new DeviceMemoryStore(join(userDataDir, 'media-device-choices.json'))
  }

  /** Install the ipc handler (once) and register the shim preload on `ses`
   * (once per session). Call for each web-page session. */
  attach(ses: Session): void {
    this.installIpc()
    if (this.attached.has(ses)) return
    this.attached.add(ses)
    ses.registerPreloadScript({
      id: 'mira-media-device-picker',
      type: 'frame',
      filePath: this.ensureShimPreload()
    })
  }

  private installIpc(): void {
    if (this.ipcInstalled) return
    this.ipcInstalled = true
    ipcMain.handle(MEDIA_PICK_IPC_CHANNEL, async (event, payload) => {
      const wc = event.sender
      // "Choose devices again": armed on the camera button, consumed either here
      // or earlier by the shim's pinned-device path (this.forced).
      const forced = this.forced.delete(wc) || !!this.hooks.consumeForcePick?.(wc)
      const choice = await this.pick(payload, event.senderFrame?.origin, forced)
      if (!choice) this.hooks.onDenied?.(wc)
      return choice
    })
    ipcMain.handle(MEDIA_FORCE_PICK_CHANNEL, (event) => {
      const force = this.hooks.consumeForcePick ? this.hooks.consumeForcePick(event.sender) : false
      if (force) this.forced.add(event.sender)
      return force
    })
    ipcMain.on(MEDIA_CAPTURE_REPORT_CHANNEL, (event: IpcMainEvent, payload) => {
      const frame = event.senderFrame
      const frameKey = frame ? `${frame.processId}:${frame.routingId}` : 'main'
      this.hooks.onCapture?.(event.sender, frameKey, normalizeCaptureReport(payload))
    })
  }

  /** Show the picker for one getUserMedia request and resolve the choice, or null
   * to cancel (a picker already up, or nothing to pick). */
  private async pick(
    payload: unknown,
    frameOrigin?: string,
    forced = false
  ): Promise<MediaPickChoice | null> {
    const request = normalizePickRequest(payload)
    // The origin comes from the frame, not from the page's own claim: a page
    // must not read another site's remembered devices.
    if (frameOrigin !== undefined) request.origin = frameOrigin === 'null' ? '' : frameOrigin
    if (!forced) {
      const remembered = this.memory.lookup(request)
      if (remembered) return remembered
    }
    if (this.pickerOpen) return null
    const hasVideo = request.wantVideo && request.videoDevices.length > 0
    const hasAudio = request.wantAudio && request.audioDevices.length > 0
    // Nothing to choose from — let the real getUserMedia proceed with defaults
    // (returning a non-null empty choice would rewrite nothing anyway, but the
    // shim treats null as cancel, so signal "no devices" by an empty allow).
    if (!hasVideo && !hasAudio) return { video: null, audio: null }
    this.pickerOpen = true
    try {
      const choice = await showMediaDevicePicker(request, {
        parent: BrowserWindow.getFocusedWindow(),
        preloadPath: this.ensurePickerPreload()
      })
      if (choice) this.memory.remember(request.origin, choice)
      return choice
    } finally {
      this.pickerOpen = false
    }
  }

  private ensureShimPreload(): string {
    return (this.shimPreloadPath ??= this.writeShim(
      'media-device-picker-shim.js',
      GUM_SHIM_PRELOAD_SOURCE
    ))
  }

  private ensurePickerPreload(): string {
    return (this.pickerPreloadPath ??= this.writeShim(
      'media-device-picker-preload.js',
      DEVICE_PICKER_PRELOAD_SOURCE
    ))
  }

  private writeShim(name: string, source: string): string {
    const dir = join(this.userDataDir, 'sw-shims')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const path = join(dir, name)
    writeFileSync(path, source, 'utf8')
    return path
  }
}
