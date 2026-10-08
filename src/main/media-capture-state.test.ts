import { describe, it, expect } from 'vitest'
import {
  buildMediaCaptureMenu,
  MediaCaptureTracker,
  normalizeCaptureReport
} from './media-capture-state'

describe('normalizeCaptureReport', () => {
  it('keeps string labels per kind', () => {
    expect(normalizeCaptureReport({ video: ['Cam'], audio: ['Mic', ''] })).toEqual({
      video: ['Cam'],
      audio: ['Mic', '']
    })
  })

  it('drops malformed payloads', () => {
    expect(normalizeCaptureReport(null)).toEqual({ video: [], audio: [] })
    expect(normalizeCaptureReport({ video: 'Cam', audio: [42] })).toEqual({
      video: [],
      audio: ['']
    })
  })
})

describe('MediaCaptureTracker', () => {
  it('shows nothing for an unknown tab', () => {
    expect(new MediaCaptureTracker().infoFor(1)).toBeNull()
  })

  it('merges the live tracks of every frame, deduping labels', () => {
    const t = new MediaCaptureTracker()
    t.report(1, 'a', { video: ['Cam'], audio: ['Mic'] })
    t.report(1, 'b', { video: [], audio: ['Mic'] })
    expect(t.infoFor(1)).toEqual({
      camera: true,
      microphone: true,
      blocked: false,
      cameraLabels: ['Cam'],
      microphoneLabels: ['Mic']
    })
  })

  it('hides the state once every track has ended', () => {
    const t = new MediaCaptureTracker()
    t.report(1, 'a', { video: ['Cam'], audio: [] })
    t.report(1, 'a', { video: [], audio: [] })
    expect(t.infoFor(1)).toBeNull()
  })

  it('flags a cancelled picker as blocked, until a capture starts', () => {
    const t = new MediaCaptureTracker()
    t.markBlocked(1)
    expect(t.infoFor(1)).toMatchObject({ camera: false, microphone: false, blocked: true })
    t.report(1, 'a', { video: ['Cam'], audio: [] })
    expect(t.infoFor(1)?.blocked).toBe(false)
  })

  it('clears tracks and block on a new document', () => {
    const t = new MediaCaptureTracker()
    t.report(1, 'a', { video: ['Cam'], audio: [] })
    t.markBlocked(1)
    t.resetForNavigation(1)
    expect(t.infoFor(1)).toBeNull()
  })

  it('keeps an armed force-pick across the reload that follows it, once', () => {
    const t = new MediaCaptureTracker()
    t.markBlocked(1)
    t.armForcePick(1)
    expect(t.infoFor(1)).toBeNull() // block cleared at once
    t.resetForNavigation(1)
    expect(t.consumeForcePick(1)).toBe(true)
    expect(t.consumeForcePick(1)).toBe(false)
  })

  it('never forces the picker for a tab that did not ask', () => {
    expect(new MediaCaptureTracker().consumeForcePick(7)).toBe(false)
  })

  it('forgets a destroyed webContents', () => {
    const t = new MediaCaptureTracker()
    t.report(1, 'a', { video: ['Cam'], audio: [] })
    t.armForcePick(1)
    t.forget(1)
    expect(t.infoFor(1)).toBeNull()
    expect(t.consumeForcePick(1)).toBe(false)
  })
})

describe('buildMediaCaptureMenu', () => {
  const info = {
    camera: true,
    microphone: true,
    blocked: false,
    cameraLabels: ['GENERAL WEBCAM'],
    microphoneLabels: ['']
  }

  it('lists the devices in use, then the reset action', () => {
    expect(buildMediaCaptureMenu('t1', info)).toEqual([
      { type: 'disabled', label: 'Using camera: GENERAL WEBCAM' },
      { type: 'disabled', label: 'Using your microphone' },
      { type: 'separator' },
      {
        type: 'command',
        command: 'reset-media-capture',
        params: { tabId: 't1' },
        label: 'Choose devices again (reloads the page)'
      }
    ])
  })

  it('offers to allow again when blocked', () => {
    const items = buildMediaCaptureMenu('t1', {
      ...info,
      camera: false,
      microphone: false,
      blocked: true
    })
    expect(items[0]).toEqual({
      type: 'disabled',
      label: 'Camera and microphone blocked on this page'
    })
    expect(items.at(-1)).toMatchObject({
      command: 'reset-media-capture',
      label: 'Allow again and reload'
    })
  })

  it('still offers the reset with nothing to report', () => {
    const items = buildMediaCaptureMenu('t1', null)
    expect(items[0]).toEqual({ type: 'disabled', label: 'Not using your camera or microphone' })
    expect(items.at(-1)).toMatchObject({ command: 'reset-media-capture', params: { tabId: 't1' } })
  })
})
