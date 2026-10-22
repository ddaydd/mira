import { describe, expect, it, vi } from 'vitest'
import { firstWorkingIcon, isIconResponse } from './favicon-pick'

describe('isIconResponse', () => {
  it('accepts an ok image', () => {
    expect(isIconResponse(true, 'image/png')).toBe(true)
    expect(isIconResponse(true, 'image/x-icon')).toBe(true)
  })
  it('rejects the HTML a SPA serves for a missing file, and errors', () => {
    expect(isIconResponse(true, 'text/html; charset=utf-8')).toBe(false)
    expect(isIconResponse(false, 'image/png')).toBe(false)
    expect(isIconResponse(true, null)).toBe(false)
  })
})

describe('firstWorkingIcon', () => {
  const a = 'https://x.fr/android-chrome-192x192.png'
  const b = 'https://x.fr/favicon-32x32.png'

  it('skips a candidate that is not an image', async () => {
    const probe = vi.fn(async (u: string) => u === b)
    expect(await firstWorkingIcon([a, b], probe, new Map())).toBe(b)
  })

  it('keeps the first when it works, without probing the rest', async () => {
    const probe = vi.fn(async () => true)
    expect(await firstWorkingIcon([a, b], probe, new Map())).toBe(a)
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('returns null when nothing works, and a throwing probe counts as a miss', async () => {
    const probe = vi.fn(async () => {
      throw new Error('net')
    })
    expect(await firstWorkingIcon([a, b], probe, new Map())).toBeNull()
  })

  it('takes a data: image as is and ignores other schemes', async () => {
    const probe = vi.fn(async () => false)
    expect(
      await firstWorkingIcon(['chrome://x', 'data:image/png;base64,AA'], probe, new Map())
    ).toBe('data:image/png;base64,AA')
    expect(probe).not.toHaveBeenCalled()
  })

  it('probes a url once across calls', async () => {
    const probe = vi.fn(async (u: string) => u === b)
    const seen = new Map()
    await firstWorkingIcon([a, b], probe, seen)
    await firstWorkingIcon([a, b], probe, seen)
    expect(probe).toHaveBeenCalledTimes(2)
  })
})
