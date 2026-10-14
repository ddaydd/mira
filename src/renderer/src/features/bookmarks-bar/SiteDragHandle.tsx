// The site icon left of the address field, Chrome style: drag it onto the
// bookmarks bar to bookmark the page at the spot it is dropped (the bar handles
// the drop, see BookmarksBar). It also carries a plain url list, so dropping it
// on another app (a text field, the desktop) gives the url.

import { useState, type ReactElement } from 'react'
import { MIRA_PAGE_MIME } from './drop'

export default function SiteDragHandle({
  url,
  title,
  favicon
}: {
  url: string
  title: string
  favicon: string | null
}): ReactElement | null {
  const [broken, setBroken] = useState<string | null>(null)
  if (!/^(https?|file):/i.test(url)) return null
  return (
    <span
      className="site-drag-handle"
      draggable
      title="Drag to the bookmarks bar to bookmark this page"
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copyLink'
        e.dataTransfer.setData(MIRA_PAGE_MIME, JSON.stringify({ url, title }))
        e.dataTransfer.setData('text/uri-list', url)
        e.dataTransfer.setData('text/plain', url)
      }}
    >
      {favicon && broken !== favicon ? (
        <img src={favicon} alt="" draggable={false} onError={() => setBroken(favicon)} />
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M1.9 8h12.2M8 1.7c-2.2 2.4-2.2 10.2 0 12.6M8 1.7c2.2 2.4 2.2 10.2 0 12.6"
            stroke="currentColor"
            strokeWidth="1.1"
          />
        </svg>
      )}
    </span>
  )
}
