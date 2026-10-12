// Remembers the camera/mic a site was given in the device picker, so the picker
// does not come back on every getUserMedia (Linux fork). Without it, a site that
// asks for the camera without pinning a deviceId (Vonage/OpenTok, most visio
// apps) showed the picker at every visit, often twice per visit.
//
// Keyed by origin. Chromium's deviceIds are already salted per origin AND per
// storage partition (profile), so an id remembered under one profile never
// matches the device list another profile sees: the picker just shows there.
// A remembered device that is gone (unplugged) shows the picker too.
// "Choose devices again" on the camera button bypasses the memory once, and the
// new pick replaces the old one. Saved in <userData>/media-device-choices.json.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { MediaPickChoice, MediaPickRequest } from './media-device-picker'

/** What is remembered for one origin: the deviceId per kind, null = never picked. */
export interface RememberedDevices {
  video: string | null
  audio: string | null
}

export type DeviceMemory = Record<string, RememberedDevices>

/** The choice to answer `request` with, without showing the picker, or null
 * when the picker must show: no origin, a wanted kind never picked here, or a
 * remembered device no longer in the list. A wanted kind with no device at all
 * is left null (the page gets the default), as the picker would. Pure. */
export function rememberedChoice(
  memory: DeviceMemory,
  request: MediaPickRequest
): MediaPickChoice | null {
  if (!request.origin) return null
  const saved = memory[request.origin]
  if (!saved) return null
  const resolve = (
    wanted: boolean,
    devices: MediaPickRequest['videoDevices'],
    id: string | null
  ): string | null | undefined => {
    if (!wanted || devices.length === 0) return null
    if (!id || !devices.some((d) => d.deviceId === id)) return undefined
    return id
  }
  const video = resolve(request.wantVideo, request.videoDevices, saved.video)
  const audio = resolve(request.wantAudio, request.audioDevices, saved.audio)
  if (video === undefined || audio === undefined) return null
  return { video, audio }
}

/** Fold a picker answer into the memory, returning a NEW memory. Only the kinds
 * the user actually picked are written; the other kind keeps its old value (a
 * mic-only request does not forget the camera). Pure. */
export function rememberChoice(
  memory: DeviceMemory,
  origin: string,
  choice: MediaPickChoice
): DeviceMemory {
  if (!origin || (!choice.video && !choice.audio)) return memory
  const prev = memory[origin] ?? { video: null, audio: null }
  return {
    ...memory,
    [origin]: { video: choice.video ?? prev.video, audio: choice.audio ?? prev.audio }
  }
}

/** Validate a parsed media-device-choices.json. Pure. */
export function normalizeDeviceMemory(raw: unknown): DeviceMemory {
  const out: DeviceMemory = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const id = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
  for (const [origin, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!origin || !v || typeof v !== 'object') continue
    const r = v as Record<string, unknown>
    const entry = { video: id(r.video), audio: id(r.audio) }
    if (entry.video || entry.audio) out[origin] = entry
  }
  return out
}

/** The memory, loaded from and saved to a JSON file. */
export class DeviceMemoryStore {
  private memory: DeviceMemory

  constructor(private readonly path: string) {
    this.memory = this.load()
  }

  lookup(request: MediaPickRequest): MediaPickChoice | null {
    return rememberedChoice(this.memory, request)
  }

  remember(origin: string, choice: MediaPickChoice): void {
    const next = rememberChoice(this.memory, origin, choice)
    if (next === this.memory) return
    this.memory = next
    this.save()
  }

  private load(): DeviceMemory {
    try {
      if (!existsSync(this.path)) return {}
      return normalizeDeviceMemory(JSON.parse(readFileSync(this.path, 'utf8')))
    } catch {
      return {}
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      const tmp = `${this.path}.tmp`
      writeFileSync(tmp, JSON.stringify(this.memory, null, 2), 'utf8')
      renameSync(tmp, this.path)
    } catch {
      /* best effort: the picker just shows again next time */
    }
  }
}
