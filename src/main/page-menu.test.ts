import { describe, it, expect } from 'vitest'
import {
  buildPageMenu,
  buildMediaItem,
  buildVideoExtraItems,
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

  it('adds "Save Image" and "Save Image As…" over an image', () => {
    const items = buildPageMenu({ ...base, mediaType: 'image', srcURL: 'https://x.com/a.png' })
    expect(items).toContainEqual({
      type: 'command',
      command: 'save-image',
      params: { url: 'https://x.com/a.png' },
      label: 'Save Image',
      enabled: true
    })
    expect(items).toContainEqual({
      type: 'command',
      command: 'save-image-as',
      params: { url: 'https://x.com/a.png' },
      label: 'Save Image As…',
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

describe('buildVideoExtraItems (Linux fork)', () => {
  it('saves a plain-file video into a picked folder and copies its src', () => {
    expect(buildVideoExtraItems('https://x.com/clip.mp4')).toEqual([
      {
        type: 'command',
        command: 'save-video-as',
        params: { url: 'https://x.com/clip.mp4' },
        label: 'Save Video As…',
        enabled: true
      },
      {
        type: 'command',
        command: 'copy-text',
        params: { text: 'https://x.com/clip.mp4' },
        label: 'Copy Video Address',
        enabled: true
      }
    ])
  })

  it('routes a streamed video through its permalink', () => {
    expect(buildVideoExtraItems('blob:x')).toEqual([
      { type: 'stream-video', action: 'save-as', label: 'Save Video As…' },
      { type: 'stream-video', action: 'copy-link', label: 'Copy Video Address' }
    ])
  })

  it('offers the last video folder in one click, above Save Video As…', () => {
    const stream = buildVideoExtraItems('blob:x', '/home/me/clips/')
    expect(stream[0]).toEqual({
      type: 'stream-video',
      action: 'save-to',
      label: 'Save Video to "clips"'
    })
    expect(stream.map((i) => ('label' in i ? i.label : '-'))).toEqual([
      'Save Video to "clips"',
      'Save Video As…',
      'Copy Video Address'
    ])
    expect(buildVideoExtraItems('https://x.com/clip.mp4', '/home/me/clips')[0]).toEqual({
      type: 'command',
      command: 'save-video',
      params: { url: 'https://x.com/clip.mp4' },
      label: 'Save Video to "clips"',
      enabled: true
    })
    const menu = buildPageMenu({
      ...base,
      mediaType: 'video',
      srcURL: 'blob:x',
      videoSaveDir: '/home/me/clips'
    })
    expect(menu.some((i) => 'label' in i && i.label === 'Save Video to "clips"')).toBe(true)
  })

  it('appears under Download Video in the page menu, and only for video', () => {
    const items = buildPageMenu({ ...base, mediaType: 'video', srcURL: 'blob:x' })
    const labels = items.map((i) => ('label' in i ? i.label : '-'))
    const at = labels.indexOf('Download Video')
    expect(labels.slice(at, at + 3)).toEqual([
      'Download Video',
      'Save Video As…',
      'Copy Video Address'
    ])
    const image = buildPageMenu({ ...base, mediaType: 'image', srcURL: 'https://x.com/a.png' })
    expect(image.some((i) => 'label' in i && i.label === 'Save Video As…')).toBe(false)
  })
})
