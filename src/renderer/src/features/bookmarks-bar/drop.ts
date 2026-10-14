// Pure drop rule for the bookmarks bar, split out so it is unit-tested without a
// DOM: given each visible item's [left, right] (px, same origin as `x`) and the
// pointer's x, the top-level index a dropped page goes to — before the first item
// whose middle is right of the pointer, else after the last one — plus the x of
// the insertion marker (the gap between the two neighbours).

/** MIME type of a page dragged from Mira's own chrome (address-bar site icon,
 * a bar item): JSON `{ url, title }`, so the title survives the drop. */
export const MIRA_PAGE_MIME = 'application/x-mira-page'

export interface DropSlot {
  index: number
  markerX: number
}

export function dropSlot(items: readonly { left: number; right: number }[], x: number): DropSlot {
  const i = items.findIndex((it) => x < (it.left + it.right) / 2)
  if (items.length === 0) return { index: 0, markerX: 0 }
  if (i === -1) return { index: items.length, markerX: items[items.length - 1].right + 1 }
  const prev = items[i - 1]
  return { index: i, markerX: prev ? (prev.right + items[i].left) / 2 : items[i].left - 1 }
}

/** The page carried by a drag: Mira's own payload, else a plain url-list entry
 * (a link dragged in from elsewhere). Null when nothing usable. */
export function droppedPage(get: (type: string) => string): { url: string; title?: string } | null {
  try {
    const own = JSON.parse(get(MIRA_PAGE_MIME) || 'null') as { url?: unknown; title?: unknown }
    if (own && typeof own.url === 'string' && own.url) {
      return { url: own.url, ...(typeof own.title === 'string' ? { title: own.title } : {}) }
    }
  } catch {
    // not ours: fall through to the url list
  }
  const url = get('text/uri-list')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'))
  return url && /^(https?|file):/i.test(url) ? { url } : null
}
