// The bookmarks bar: the top-level favorites as a strip under the toolbar,
// Chrome style (View → Show Bookmarks Bar, Cmd+Shift+B). Every action is a
// registry command: a url opens in the active tab via `navigate` (Cmd/Ctrl- or
// middle-click: a new tab), a folder pops its NATIVE dropdown via
// `show-bookmarks-menu` (a DOM menu could not draw over the web view), and so
// does the » button with the items that did not fit.

import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactElement } from 'react'
import type { BookmarkNode } from '../../../../preload/index.d'
import { firstHiddenIndex } from './overflow'

/** Mira does not store favicons for favorites: ask the site for its
 * /favicon.ico, and fall back to a one-letter badge when that fails. */
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

function Icon({ node }: { node: BookmarkNode }): ReactElement {
  const [broken, setBroken] = useState(false)
  if (node.kind === 'folder') {
    return (
      <span className="bookmarks-bar-icon" aria-hidden="true">
        📁
      </span>
    )
  }
  const src = faviconUrl(node.url ?? '')
  if (!src || broken) {
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
      onError={() => setBroken(true)}
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

  return (
    <div className="bookmarks-bar">
      <div className="bookmarks-bar-strip" ref={stripRef}>
        {tree.map((node, index) => (
          <button
            key={node.id}
            type="button"
            data-bar-index={index}
            className="bookmarks-bar-item"
            title={node.kind === 'url' ? `${node.title}\n${node.url}` : node.title}
            style={
              hiddenFrom !== null && index >= hiddenFrom ? { visibility: 'hidden' } : undefined
            }
            onClick={(e) => open(node, e)}
            onAuxClick={(e) => e.button === 1 && open(node, e)}
          >
            <Icon node={node} />
            {node.title.trim() && <span className="bookmarks-bar-title">{node.title}</span>}
          </button>
        ))}
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
