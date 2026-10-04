import { describe, it, expect } from 'vitest'
import {
  buildPageMenu,
  buildMediaItem,
  imageUnderPointSource,
  needsImageProbe,
  type PageContext
} from './page-menu'

const base: PageContext = {
  linkURL: '',
  selectionText: '',
  isEditable: false,
  canGoBack: false,
  canGoForward: false,
  mediaType: 'none',
  srcURL: ''
}

describe('buildPageMenu', () => {
  it('always offers back / forward / reload, with history-driven enabled flags', () => {
    const items = buildPageMenu({ ...base, canGoBack: true, canGoForward: false })
    expect(items).toEqual([
      { type: 'command', command: 'back', label: 'Back', enabled: true },
      { type: 'command', command: 'forward', label: 'Forward', enabled: false },
      { type: 'command', command: 'reload', label: 'Reload', enabled: true },
      { type: 'separator' },
      { type: 'inspect-element', label: 'Inspect Element' }
    ])
  })

  it('always ends with an "Inspect Element" item', () => {
    const items = buildPageMenu(base)
    expect(items.at(-1)).toEqual({ type: 'inspect-element', label: 'Inspect Element' })
  })

  it('adds an "open link in new tab" command when on a link', () => {
    const items = buildPageMenu({ ...base, linkURL: 'https://example.com' })
    expect(items).toContainEqual({
      type: 'command',
      command: 'new-tab',
      params: { url: 'https://example.com' },
      label: 'Open Link in New Tab',
      enabled: true
    })
  })

  it('adds a "Copy Link Address" command when on a link', () => {
    const items = buildPageMenu({ ...base, linkURL: 'https://example.com/a' })
    expect(items).toContainEqual({
      type: 'command',
      command: 'copy-text',
      params: { text: 'https://example.com/a' },
      label: 'Copy Link Address',
      enabled: true
    })
  })

  it('offers the full clipboard set in an editable field', () => {
    const items = buildPageMenu({ ...base, isEditable: true })
    const roles = items.filter((i) => i.type === 'role').map((i) => i.type === 'role' && i.role)
    expect(roles).toEqual(['cut', 'copy', 'paste', 'selectAll'])
  })

  it('offers only Copy over a plain text selection (not editable)', () => {
    const items = buildPageMenu({ ...base, selectionText: 'hello' })
    const roles = items.filter((i) => i.type === 'role').map((i) => i.type === 'role' && i.role)
    expect(roles).toEqual(['copy'])
  })

  it('shows no clipboard items when there is neither a selection nor an editable field', () => {
    const items = buildPageMenu(base)
    expect(items.some((i) => i.type === 'role')).toBe(false)
    // The only separator is the one before the always-present Inspect item.
    expect(items.filter((i) => i.type === 'separator')).toHaveLength(1)
  })

  it('adds a direct "Download Image" command over an image', () => {
    const items = buildPageMenu({ ...base, mediaType: 'image', srcURL: 'https://x.com/a.png' })
    expect(items).toContainEqual({
      type: 'command',
      command: 'download-media',
      params: { url: 'https://x.com/a.png' },
      label: 'Download Image',
      enabled: true
    })
  })

  it('adds "Open Image in New Tab" over an image, pointing at its src', () => {
    const items = buildPageMenu({ ...base, mediaType: 'image', srcURL: 'https://x.com/a.png' })
    expect(items).toContainEqual({
      type: 'command',
      command: 'new-tab',
      params: { url: 'https://x.com/a.png' },
      label: 'Open Image in New Tab',
      enabled: true
    })
  })

  it('offers no "Open Image in New Tab" off an image', () => {
    const items = buildPageMenu(base)
    expect(items.some((i) => 'label' in i && i.label === 'Open Image in New Tab')).toBe(false)
  })

  it('routes a streamed (blob:) video to the yt-dlp download-stream item', () => {
    const items = buildPageMenu({ ...base, mediaType: 'video', srcURL: 'blob:https://x.com/abc' })
    expect(items).toContainEqual({ type: 'download-stream', label: 'Download Video' })
  })
})

describe('buildMediaItem', () => {
  it('downloads a plain-file video directly (not via yt-dlp)', () => {
    const item = buildMediaItem('video', 'https://x.com/clip.mp4')
    expect(item).toEqual({
      type: 'command',
      command: 'download-media',
      params: { url: 'https://x.com/clip.mp4' },
      label: 'Download Video',
      enabled: true
    })
  })

  it('routes a blob: or empty video src to yt-dlp (a stream has no file)', () => {
    expect(buildMediaItem('video', 'blob:x')).toEqual({
      type: 'download-stream',
      label: 'Download Video'
    })
    expect(buildMediaItem('video', '')).toEqual({
      type: 'download-stream',
      label: 'Download Video'
    })
  })

  it('downloads audio directly and ignores non-media', () => {
    expect(buildMediaItem('audio', 'https://x.com/a.mp3')).toMatchObject({
      command: 'download-media',
      label: 'Download Audio'
    })
    expect(buildMediaItem('none', '')).toBeNull()
    expect(buildMediaItem('image', '')).toBeNull()
  })
})

describe('image probe through overlays', () => {
  const run = (stack: Array<Record<string, string>>): unknown => {
    const document = { elementsFromPoint: () => stack }
    return new Function('document', `return ${imageUnderPointSource(10, 20)}`)(document)
  }

  it('finds an image hidden under a transparent overlay', () => {
    expect(run([{ tagName: 'DIV' }, { tagName: 'IMG', currentSrc: 'https://x.com/a.png' }])).toBe(
      'https://x.com/a.png'
    )
  })

  it('returns empty when no image is under the point', () => {
    expect(run([{ tagName: 'DIV' }, { tagName: 'BODY' }])).toBe('')
  })

  it('only probes when Chromium saw no media', () => {
    expect(needsImageProbe('none')).toBe(true)
    expect(needsImageProbe('image')).toBe(false)
    expect(needsImageProbe('video')).toBe(false)
  })
})
