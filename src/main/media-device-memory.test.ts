import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import type { MediaPickRequest } from './media-device-picker'
import {
  DeviceMemoryStore,
  normalizeDeviceMemory,
  rememberChoice,
  rememberedChoice
} from './media-device-memory'

const ORIGIN = 'https://conference.example.com'

function request(over: Partial<MediaPickRequest> = {}): MediaPickRequest {
  return {
    origin: ORIGIN,
    wantVideo: true,
    wantAudio: true,
    videoDevices: [
      { deviceId: 'cam1', label: 'Webcam', kind: 'videoinput' },
      { deviceId: 'cam2', label: 'Virtual', kind: 'videoinput' }
    ],
    audioDevices: [{ deviceId: 'mic1', label: 'Headset', kind: 'audioinput' }],
    ...over
  }
}

describe('rememberedChoice', () => {
  it('shows the picker for an origin never picked', () => {
    expect(rememberedChoice({}, request())).toBeNull()
  })

  it('answers with the remembered devices when they are still there', () => {
    const memory = { [ORIGIN]: { video: 'cam2', audio: 'mic1' } }
    expect(rememberedChoice(memory, request())).toEqual({ video: 'cam2', audio: 'mic1' })
  })

  it('shows the picker when a remembered device is gone', () => {
    const memory = { [ORIGIN]: { video: 'cam3', audio: 'mic1' } }
    expect(rememberedChoice(memory, request())).toBeNull()
  })

  it('shows the picker when a wanted kind was never picked on this origin', () => {
    const memory = { [ORIGIN]: { video: null, audio: 'mic1' } }
    expect(rememberedChoice(memory, request())).toBeNull()
  })

  it('only needs the kinds the page wants', () => {
    const memory = { [ORIGIN]: { video: null, audio: 'mic1' } }
    expect(rememberedChoice(memory, request({ wantVideo: false }))).toEqual({
      video: null,
      audio: 'mic1'
    })
  })

  it('leaves a wanted kind with no device at all to the default', () => {
    const memory = { [ORIGIN]: { video: 'cam1', audio: 'mic1' } }
    expect(rememberedChoice(memory, request({ audioDevices: [] }))).toEqual({
      video: 'cam1',
      audio: null
    })
  })

  it('never answers for another origin, nor for an empty one', () => {
    const memory = { [ORIGIN]: { video: 'cam1', audio: 'mic1' } }
    expect(rememberedChoice(memory, request({ origin: 'https://other.example' }))).toBeNull()
    expect(
      rememberedChoice({ '': { video: 'cam1', audio: 'mic1' } }, request({ origin: '' }))
    ).toBeNull()
  })
})

describe('rememberChoice', () => {
  it('records a pick for its origin', () => {
    expect(rememberChoice({}, ORIGIN, { video: 'cam1', audio: 'mic1' })).toEqual({
      [ORIGIN]: { video: 'cam1', audio: 'mic1' }
    })
  })

  it('keeps the kind the pick did not cover', () => {
    const memory = { [ORIGIN]: { video: 'cam1', audio: 'mic1' } }
    expect(rememberChoice(memory, ORIGIN, { video: null, audio: 'mic2' })).toEqual({
      [ORIGIN]: { video: 'cam1', audio: 'mic2' }
    })
  })

  it('returns the same memory for an empty pick or no origin', () => {
    const memory = {}
    expect(rememberChoice(memory, ORIGIN, { video: null, audio: null })).toBe(memory)
    expect(rememberChoice(memory, '', { video: 'cam1', audio: null })).toBe(memory)
  })
})

describe('normalizeDeviceMemory', () => {
  it('keeps well-formed entries and drops the rest', () => {
    expect(
      normalizeDeviceMemory({
        [ORIGIN]: { video: 'cam1', audio: 42 },
        'https://empty.example': { video: '', audio: null },
        'https://junk.example': 'nope'
      })
    ).toEqual({ [ORIGIN]: { video: 'cam1', audio: null } })
  })

  it('returns an empty memory for a malformed file', () => {
    expect(normalizeDeviceMemory(null)).toEqual({})
    expect(normalizeDeviceMemory([1, 2])).toEqual({})
  })
})

describe('DeviceMemoryStore', () => {
  let dir = ''
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('persists a pick across instances', () => {
    dir = mkdtempSync(join(tmpdir(), 'mira-devmem-'))
    const path = join(dir, 'media-device-choices.json')
    new DeviceMemoryStore(path).remember(ORIGIN, { video: 'cam1', audio: 'mic1' })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      [ORIGIN]: { video: 'cam1', audio: 'mic1' }
    })
    expect(new DeviceMemoryStore(path).lookup(request())).toEqual({ video: 'cam1', audio: 'mic1' })
  })

  it('starts empty on a corrupt file', () => {
    dir = mkdtempSync(join(tmpdir(), 'mira-devmem-'))
    const path = join(dir, 'media-device-choices.json')
    writeFileSync(path, '{not json', 'utf8')
    expect(new DeviceMemoryStore(path).lookup(request())).toBeNull()
  })
})
