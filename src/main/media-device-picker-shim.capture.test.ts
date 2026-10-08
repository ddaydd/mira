import { describe, it, expect, vi } from 'vitest'
import { GUM_SHIM_MAIN_WORLD } from './media-device-picker-shim'

// Runs the REAL main-world shim string against a fake page (navigator,
// MediaStreamTrack) to pin what the camera button relies on: capture reports and
// the forced picker. The pure helpers are covered in media-device-picker-shim.test.ts.

class FakeTrack {
  readyState = 'live'
  private listeners: Array<() => void> = []
  constructor(
    public kind: 'video' | 'audio',
    public label: string
  ) {}
  addEventListener(_type: string, fn: () => void): void {
    this.listeners.push(fn)
  }
  stop(): void {
    this.readyState = 'ended'
  }
  end(): void {
    this.readyState = 'ended'
    this.listeners.forEach((fn) => fn())
  }
}

interface Bridge {
  pickDevices: (req: unknown) => unknown
  reportCapture: (state: unknown) => void
  forcePick: () => unknown
}

function setup(bridge: Partial<Bridge>): {
  gum: (c: unknown) => Promise<{ getTracks: () => FakeTrack[] }>
  realGum: ReturnType<typeof vi.fn>
  reports: unknown[]
} {
  const realGum = vi.fn(async (c: { video?: unknown; audio?: unknown }) => {
    const tracks: FakeTrack[] = []
    if (c.video) tracks.push(new FakeTrack('video', 'Cam'))
    if (c.audio) tracks.push(new FakeTrack('audio', 'Mic'))
    return { getTracks: () => tracks }
  })
  const md = {
    getUserMedia: realGum,
    enumerateDevices: async () => [
      { kind: 'videoinput', deviceId: 'cam1', label: 'Cam' },
      { kind: 'audioinput', deviceId: 'mic1', label: 'Mic' }
    ]
  } as Record<string, unknown>
  const reports: unknown[] = []
  const full: Bridge = {
    pickDevices: async () => ({ video: 'cam1', audio: 'mic1' }),
    reportCapture: (s) => reports.push(s),
    forcePick: async () => false,
    ...bridge
  }
  const MediaStreamTrack = FakeTrack
  const install = new Function(
    'navigator',
    'location',
    'window',
    'MediaStreamTrack',
    `return ${GUM_SHIM_MAIN_WORLD}`
  )({ mediaDevices: md }, { origin: 'https://example.org' }, { MediaStreamTrack }, MediaStreamTrack)
  install(full)
  return {
    gum: md.getUserMedia as (c: unknown) => Promise<{ getTracks: () => FakeTrack[] }>,
    realGum,
    reports
  }
}

describe('getUserMedia shim — capture reports', () => {
  it('reports the live tracks, then their end', async () => {
    const { gum, reports } = setup({})
    const stream = await gum({ video: true, audio: true })
    expect(reports.at(-1)).toEqual({ video: ['Cam'], audio: ['Mic'] })
    const [video, audio] = stream.getTracks()
    video.end()
    expect(reports.at(-1)).toEqual({ video: [], audio: ['Mic'] })
    audio.stop() // the page stopping a track fires no 'ended': the hook reports it
    expect(reports.at(-1)).toEqual({ video: [], audio: [] })
  })

  it('rejects with NotAllowedError when the picker is cancelled, reporting nothing', async () => {
    const { gum, reports, realGum } = setup({ pickDevices: async () => null })
    await expect(gum({ video: true })).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(realGum).not.toHaveBeenCalled()
    expect(reports).toEqual([])
  })
})

describe('getUserMedia shim — pinned devices', () => {
  const pinned = { video: { deviceId: { exact: 'cam9' } } }

  it('skips the picker when the page pinned its device', async () => {
    const pick = vi.fn(async () => ({ video: 'cam1', audio: null }))
    const { gum, realGum } = setup({ pickDevices: pick })
    await gum(pinned)
    expect(pick).not.toHaveBeenCalled()
    expect(realGum).toHaveBeenCalledWith(pinned)
  })

  it('shows the picker anyway when main forces it, and uses the choice', async () => {
    const pick = vi.fn(async () => ({ video: 'cam1', audio: null }))
    const { gum, realGum, reports } = setup({ pickDevices: pick, forcePick: async () => true })
    await gum(pinned)
    expect(pick).toHaveBeenCalledTimes(1)
    expect(realGum).toHaveBeenCalledWith({ video: { deviceId: { exact: 'cam1' } } })
    expect(reports.at(-1)).toEqual({ video: ['Cam'], audio: [] })
  })
})
