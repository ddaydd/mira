// What the user is looking at in one window, in one call: which window, which
// tab, which overlays and panels are up. For an agent asked "do you see what I
// have open?": before this it took `mira tabs` + `mira windows` + a full-screen
// capture, and a capture is still the only way to see the page itself. Pure:
// profiles.ts gathers the snapshot, this file shapes it and words the summary.

export interface UiTab {
  id: string
  title: string
  url: string
  audible: boolean
}

export interface UiState {
  windowId: string
  profileId: string
  /** The window has the OS focus (Mira is in front, on this window). */
  focused: boolean
  maximized: boolean
  fullScreen: boolean
  minimized: boolean
  /** The active tab; null when the window shows its Settings tab or is empty. */
  activeTab: UiTab | null
  tabCount: number
  /** Overlays drawn over the page (each hides the web view while open). */
  open: {
    palette: boolean
    mediaGallery: boolean
    settings: boolean
    skillPane: boolean
    /** Text of the find-in-page bar, when a search is up. */
    find: string | null
    /** A page element (video) in HTML fullscreen. */
    htmlFullScreen: boolean
  }
  sidebar: boolean
  bookmarksBar: boolean
  zen: boolean
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url
  } catch {
    return url
  }
}

/** One readable paragraph: what a human would say looking at the window. */
export function uiStateSummary(s: UiState): string {
  const mode = [
    s.focused ? 'in front' : 'in the background',
    s.minimized ? 'minimized' : s.fullScreen ? 'fullscreen' : s.maximized ? 'maximized' : null
  ]
    .filter(Boolean)
    .join(', ')
  const tab = s.activeTab
    ? `${s.activeTab.title || '(untitled)'} (${host(s.activeTab.url)})${s.activeTab.audible ? ' ♪' : ''} — ${s.activeTab.id}`
    : s.open.settings
      ? 'Settings'
      : 'none'
  const open = [
    s.open.palette && 'command palette',
    s.open.mediaGallery && 'Media panel',
    s.open.skillPane && 'AI panel',
    s.open.find !== null && `find bar "${s.open.find}"`,
    s.open.htmlFullScreen && 'video fullscreen'
  ].filter(Boolean)
  return [
    `window ${s.windowId} (${s.profileId}) — ${mode}, ${s.tabCount} tab${s.tabCount === 1 ? '' : 's'}`,
    `active tab: ${tab}`,
    `open: ${open.length ? open.join(', ') : 'nothing over the page'}`,
    `sidebar: ${s.sidebar ? 'shown' : 'hidden'} · bookmarks bar: ${s.bookmarksBar ? 'shown' : 'hidden'} · zen: ${s.zen ? 'on' : 'off'}`
  ].join('\n')
}
