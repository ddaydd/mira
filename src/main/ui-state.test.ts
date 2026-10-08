import { describe, it, expect } from 'vitest'
import { uiStateSummary, type UiState } from './ui-state'

const base: UiState = {
  windowId: 'w1',
  profileId: 'default',
  focused: true,
  maximized: true,
  fullScreen: false,
  minimized: false,
  activeTab: {
    id: 't1',
    title: 'Journey - Wheel In the Sky',
    url: 'https://www.youtube.com/watch?v=x',
    audible: true
  },
  tabCount: 6,
  open: {
    palette: false,
    mediaGallery: true,
    settings: false,
    skillPane: false,
    find: null,
    htmlFullScreen: false
  },
  sidebar: false,
  bookmarksBar: true,
  zen: false
}

describe('uiStateSummary', () => {
  it('says which window, which tab and what is open', () => {
    expect(uiStateSummary(base)).toBe(
      [
        'window w1 (default) — in front, maximized, 6 tabs',
        'active tab: Journey - Wheel In the Sky (youtube.com) ♪ — t1',
        'open: Media panel',
        'sidebar: hidden · bookmarks bar: shown · zen: off'
      ].join('\n')
    )
  })

  it('names a background window, the Settings tab and an idle page', () => {
    const s: UiState = {
      ...base,
      focused: false,
      maximized: false,
      activeTab: null,
      tabCount: 1,
      open: { ...base.open, mediaGallery: false, settings: true, find: 'price' }
    }
    const text = uiStateSummary(s)
    expect(text).toContain('in the background, 1 tab')
    expect(text).toContain('active tab: Settings')
    expect(text).toContain('open: find bar "price"')
  })
})
