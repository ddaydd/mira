// The bookmarks bar: the top-level favorites as a strip under the toolbar,
// Chrome style (View → Show Bookmarks Bar, Cmd+Shift+B). Every action is a
// registry command: a url opens in the active tab via `navigate` (Cmd/Ctrl- or
// middle-click: a new tab), a folder pops its NATIVE dropdown via
// `show-bookmarks-menu` (a DOM menu could not draw over the web view), and so
// does the » button with the items that did not fit. A right-click pops the
// item's native menu (`show-bookmark-menu`); its Rename… comes back here as an
// inline text field (`edit-bookmark` → onEditBookmark → rename-bookmark).
// A page dropped on the strip (the address-bar site icon, a link, a url item
// dragged to reorder) is bookmarked at that spot (`add-bookmark-to-bar`).

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactElement
} from 'react'
import type { BookmarkNode } from '../../../../preload/index.d'
import { firstHiddenIndex } from './overflow'
import { dropSlot, droppedPage, MIRA_PAGE_MIME, type DropSlot } from './drop'

/** Whether a drag carries a page the bar can take (types only: the data itself
 * is unreadable until the drop). */
function carriesPage(e: DragEvent): boolean {
  const types = e.dataTransfer.types
  return types.includes(MIRA_PAGE_MIME) || types.includes('text/uri-list')
}

/** Fallback when main knows no icon for the page (bookmark-favicons): the
 * site's /favicon.ico, then a one-letter badge when that fails too. */
function faviconUrl(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.origin}/favicon.ico` : null
  } catch {
    return null
  }
}

function initial(node: BookmarkNode): string {
  const fromTitle = node.title.trim()[0]
  if (fromTitle) return fromTitle.toUpperCase()
  try {
    return new URL(node.url ?? '').hostname.replace(/^www\./, '')[0]?.toUpperCase() ?? '•'
  } catch {
    return '•'
  }
}

function Icon({ node, icon }: { node: BookmarkNode; icon?: string | null }): ReactElement {
  const [broken, setBroken] = useState<string | null>(null)
  if (node.kind === 'folder') {
    return (
      <span className="bookmarks-bar-icon" aria-hidden="true">
        📁
      </span>
    )
  }
  // The declared icon first; if it fails to load, the site's /favicon.ico.
  const declared = icon && broken !== icon ? icon : null
  const fallback = faviconUrl(node.url ?? '')
  const src = declared ?? (fallback && broken !== fallback ? fallback : null)
  if (!src) {
    return (
      <span className="bookmarks-bar-icon bookmarks-bar-letter" aria-hidden="true">
        {initial(node)}
      </span>
    )
  }
  return (
    <img
      className="bookmarks-bar-icon"
      src={src}
      alt=""
      draggable={false}
      onError={() => setBroken(src)}
    />
  )
}

/** Drop the native dropdown just under the clicked element. */
function under(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.bottom }
}

export default function BookmarksBar({ tree }: { tree: BookmarkNode[] }): ReactElement {
  const stripRef = useRef<HTMLDivElement>(null)
  const [hiddenFrom, setHiddenFrom] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [slot, setSlot] = useState<DropSlot | null>(null)
  const [icons, setIcons] = useState<Record<string, string | null>>({})

  // The icon each favorite's page declares (main remembers it from visits, or
  // reads the page once): Google Maps gets its pin, not google.fr's "G".
  useEffect(() => {
    const urls = tree.flatMap((n) => (n.kind === 'url' && n.url ? [n.url] : []))
    if (urls.length === 0) return
    let alive = true
    void window.mira.command('bookmark-favicons', { urls }).then((res) => {
      const r = res as { ok?: boolean; icons?: Record<string, string | null> }
      if (alive && r.ok && r.icons) setIcons(r.icons)
    })
    return () => {
      alive = false
    }
  }, [tree])

  useEffect(() => window.mira.onEditBookmark((id) => setEditingId(id)), [])

  const commitRename = (node: BookmarkNode, value: string): void => {
    setEditingId(null)
    const title = value.trim()
    // An empty title would turn the item into a bare icon by accident: ignore it.
    if (title && title !== node.title)
      window.mira.command('rename-bookmark', { id: node.id, title })
  }

  // Recompute which items overflow on every resize of the strip and every tree
  // change. The strip clips (overflow: hidden); the rest goes to the » menu.
  useLayoutEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const measure = (): void => {
      const items = Array.from(strip.querySelectorAll<HTMLElement>('[data-bar-index]'))
      setHiddenFrom(
        firstHiddenIndex(
          items.map((el) => el.offsetLeft + el.offsetWidth),
          strip.clientWidth
        )
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(strip)
    return () => observer.disconnect()
  }, [tree])

  const open = (node: BookmarkNode, e: MouseEvent<HTMLButtonElement>): void => {
    if (node.kind === 'folder') {
      window.mira.command('show-bookmarks-menu', { folderId: node.id, ...under(e.currentTarget) })
      return
    }
    const newTab = e.button === 1 || e.metaKey || e.ctrlKey
    window.mira.command('navigate', { url: node.url, ...(newTab ? { newTab: true } : {}) })
  }

  // The slot under the pointer, among the items actually shown (not the ones
  // the » menu took), in the strip's own coordinates.
  const slotAt = (clientX: number): DropSlot | null => {
    const strip = stripRef.current
    if (!strip) return null
    const shown = Array.from(strip.querySelectorAll<HTMLElement>('[data-bar-index]')).filter(
      (el) => hiddenFrom === null || Number(el.dataset.barIndex) < hiddenFrom
    )
    const x = clientX - strip.getBoundingClientRect().left
    return dropSlot(
      shown.map((el) => ({ left: el.offsetLeft, right: el.offsetLeft + el.offsetWidth })),
      x
    )
  }

  const onDragOver = (e: DragEvent<HTMLDivElement>): void => {
    if (!carriesPage(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy'
    const next = slotAt(e.clientX)
    if (next?.index !== slot?.index || next?.markerX !== slot?.markerX) setSlot(next)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    const target = slotAt(e.clientX)
    setSlot(null)
    const page = droppedPage((type) => e.dataTransfer.getData(type))
    if (!page || !target) return
    e.preventDefault()
    window.mira.command('add-bookmark-to-bar', { ...page, index: target.index })
  }

  return (
    <div className="bookmarks-bar">
      <div
        className="bookmarks-bar-strip"
        ref={stripRef}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          // Leaving for a child item is not leaving the strip.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSlot(null)
        }}
        onDrop={onDrop}
      >
        {slot && <span className="bookmarks-bar-drop-marker" style={{ left: slot.markerX }} />}
        {tree.map((node, index) =>
          node.id === editingId ? (
            <input
              key={node.id}
              data-bar-index={index}
              className="bookmarks-bar-edit"
              defaultValue={node.title}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(node, e.currentTarget.value)
                else if (e.key === 'Escape') setEditingId(null)
              }}
              onBlur={(e) => commitRename(node, e.currentTarget.value)}
            />
          ) : (
            <button
              key={node.id}
              type="button"
              data-bar-index={index}
              className="bookmarks-bar-item"
              title={node.kind === 'url' ? `${node.title}\n${node.url}` : node.title}
              style={
                hiddenFrom !== null && index >= hiddenFrom ? { visibility: 'hidden' } : undefined
              }
              draggable={node.kind === 'url'}
              onDragStart={(e) => {
                // Reorder: dropping it back on the strip moves the favorite there
                // (add-bookmark-to-bar does not duplicate a known url).
                if (node.kind !== 'url' || !node.url) return
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData(
                  MIRA_PAGE_MIME,
                  JSON.stringify({ url: node.url, title: node.title })
                )
                e.dataTransfer.setData('text/uri-list', node.url)
              }}
              onClick={(e) => open(node, e)}
              onAuxClick={(e) => e.button === 1 && open(node, e)}
              onContextMenu={(e) => {
                e.preventDefault()
                window.mira.command('show-bookmark-menu', {
                  id: node.id,
                  x: e.clientX,
                  y: e.clientY
                })
              }}
            >
              <Icon key={icons[node.url ?? ''] ?? ''} node={node} icon={icons[node.url ?? '']} />
              {node.title.trim() && <span className="bookmarks-bar-title">{node.title}</span>}
            </button>
          )
        )}
      </div>
      {hiddenFrom !== null && (
        <button
          type="button"
          className="bookmarks-bar-item bookmarks-bar-more"
          title="More bookmarks"
          aria-label="More bookmarks"
          onClick={(e) =>
            window.mira.command('show-bookmarks-menu', {
              fromIndex: hiddenFrom,
              ...under(e.currentTarget)
            })
          }
        >
          »
        </button>
      )}
    </div>
  )
}
