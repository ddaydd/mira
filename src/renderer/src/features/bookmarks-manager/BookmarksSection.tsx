import { useEffect, useMemo, useState } from 'react'
import { timeAgo } from '../audio-history/time-ago'
import {
  bookmarkHost,
  bookmarkRows,
  queryBookmarks,
  type BookmarkFilter,
  type BookmarkNodeLike,
  type BookmarkRow,
  type BookmarkSort
} from './bookmark-rows'

// Settings → Bookmarks (Linux fork): the bookmark manager. Every favorite of this
// window's profile in one searchable list, with its folder and the date it was
// added. Live: main pushes mira:bookmarks-changed on every change, whoever made
// it (bar, menu, socket). Every action is a registry command.

async function run(name: string, params?: unknown): Promise<Record<string, unknown>> {
  return (await window.mira.command(name, params)) as Record<string, unknown>
}

/** Rows rendered at once: thousands of favorites would make every keystroke slow. */
const PAGE = 200

const SORTS: Array<{ key: BookmarkSort; label: string }> = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'title', label: 'Title' },
  { key: 'tree', label: 'Bar order' }
]

const FILTERS: Array<{ key: BookmarkFilter; label: string }> = [
  { key: 'all', label: 'Everything' },
  { key: 'urls', label: 'Pages' },
  { key: 'folders', label: 'Folders' },
  { key: 'duplicates', label: 'Duplicates' },
  { key: 'undated', label: 'No date' }
]

function fullDate(at: number): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
}

function Icon({
  row,
  icons
}: {
  row: BookmarkRow
  icons: Record<string, string | null>
}): React.JSX.Element {
  const [broken, setBroken] = useState(false)
  if (row.kind === 'folder') return <span className="bm-icon bm-folder">📁</span>
  const src = icons[row.url]
  if (src && !broken) {
    return <img className="bm-icon" src={src} alt="" onError={() => setBroken(true)} />
  }
  return (
    <span className="bm-icon bm-letter">{(bookmarkHost(row.url)[0] ?? '?').toUpperCase()}</span>
  )
}

export function BookmarksSection(): React.JSX.Element {
  const [tree, setTree] = useState<BookmarkNodeLike[]>([])
  const [text, setText] = useState('')
  const [sort, setSort] = useState<BookmarkSort>('newest')
  const [filter, setFilter] = useState<BookmarkFilter>('all')
  const [folderId, setFolderId] = useState<string | undefined>()
  // How many rows are shown, for one query: a new search starts again at PAGE.
  const [more, setMore] = useState<{ key: string; limit: number }>({ key: '', limit: PAGE })
  const [icons, setIcons] = useState<Record<string, string | null>>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    void run('list-bookmarks').then((res) => {
      if (res.ok) setTree((res.tree as BookmarkNodeLike[]) ?? [])
      else setError(String(res.error))
    })
    return window.mira.onBookmarksChanged((state) =>
      setTree((state as { tree: BookmarkNodeLike[] }).tree)
    )
  }, [])

  const rows = useMemo(() => bookmarkRows(tree), [tree])
  const found = useMemo(
    () => queryBookmarks(rows, { text, sort, filter, folderId }),
    [rows, text, sort, filter, folderId]
  )
  const queryKey = JSON.stringify([text, sort, filter, folderId])
  const limit = more.key === queryKey ? more.limit : PAGE
  const shown = found.slice(0, limit)
  const folder = folderId ? rows.find((r) => r.id === folderId) : undefined
  const urlCount = rows.filter((r) => r.kind === 'url').length
  const undated = rows.filter((r) => r.kind === 'url' && r.createdAt === undefined).length

  // Icons of the rows on screen only, asked again when that set changes.
  const shownUrls = shown
    .filter((r) => r.kind === 'url')
    .map((r) => r.url)
    .join('\n')
  useEffect(() => {
    const urls = shownUrls ? shownUrls.split('\n').filter((u) => !(u in icons)) : []
    if (urls.length === 0) return
    let alive = true
    void run('bookmark-favicons', { urls }).then((res) => {
      if (alive && res.ok) setIcons((prev) => ({ ...prev, ...(res.icons as typeof icons) }))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownUrls])

  const act = async (name: string, params?: unknown): Promise<Record<string, unknown>> => {
    const res = await run(name, params)
    setError(res.ok ? null : String(res.error))
    return res
  }

  const fillDates = async (): Promise<void> => {
    const res = await act('fill-bookmark-dates-from-chrome')
    if (res.ok) setNotice(`${res.filled} date(s) recovered from Chrome.`)
  }

  const remove = async (row: BookmarkRow): Promise<void> => {
    // A folder takes its whole subtree with it: say so before it is gone.
    if (row.kind === 'folder' && row.size > 0) {
      const ok = window.confirm(`Delete "${row.title}" and the ${row.size} bookmark(s) inside?`)
      if (!ok) return
    }
    await act('remove-bookmark', { id: row.id })
  }

  return (
    <div className="settings-section bm-section">
      <p className="settings-hint">
        {urlCount} bookmarks in {rows.length - urlCount} folders, for this window&apos;s profile.
        Search looks in titles, addresses and folder names.
      </p>
      <div className="bm-toolbar">
        <input
          className="settings-input bm-search"
          type="search"
          autoFocus
          placeholder="Search bookmarks"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <select
          className="settings-input bm-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as BookmarkFilter)}
        >
          {FILTERS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          className="settings-input bm-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as BookmarkSort)}
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="bm-status">
        <span>
          {found.length} result{found.length === 1 ? '' : 's'}
        </span>
        {folder && (
          <span className="bm-chip">
            In {[...folder.path, folder.title || 'Untitled folder'].join(' › ')}
            <button aria-label="Show every folder" onClick={() => setFolderId(undefined)}>
              ×
            </button>
          </span>
        )}
        {undated > 0 && (
          <button className="btn btn-ghost bm-dates" onClick={() => void fillDates()}>
            Get missing dates from Chrome ({undated})
          </button>
        )}
      </div>
      {notice && <p className="settings-hint">{notice}</p>}
      {error && <p className="settings-error">{error}</p>}
      {found.length === 0 ? (
        <p className="settings-hint">No bookmark matches.</p>
      ) : (
        <ul className="bm-list">
          {shown.map((row) => (
            <li key={row.id} className="bm-item">
              <Icon row={row} icons={icons} />
              <div className="bm-main">
                <button
                  className="bm-title"
                  title={row.kind === 'url' ? row.url : 'Show what is inside'}
                  onClick={() =>
                    row.kind === 'url'
                      ? void act('open-bookmark', { id: row.id })
                      : setFolderId(row.id)
                  }
                >
                  {row.title || (row.kind === 'url' ? row.url : 'Untitled folder')}
                </button>
                <span className="bm-meta">
                  {row.kind === 'url' ? (
                    <span title={row.url}>{bookmarkHost(row.url)}</span>
                  ) : (
                    <span>{row.size} bookmark(s)</span>
                  )}
                  {row.path.length > 0 && (
                    <>
                      {' · '}
                      <button
                        className="bm-path"
                        title="Show this folder"
                        onClick={() => setFolderId(row.ancestors[row.ancestors.length - 1])}
                      >
                        {row.path.join(' › ')}
                      </button>
                    </>
                  )}
                  {row.copies > 1 && <span className="bm-dup"> · {row.copies} copies</span>}
                </span>
              </div>
              <span
                className="bm-date"
                title={row.createdAt !== undefined ? fullDate(row.createdAt) : 'Date unknown'}
              >
                {row.createdAt !== undefined ? timeAgo(row.createdAt, now) : '—'}
              </span>
              <div className="bm-actions">
                {row.kind === 'folder' && row.size > 0 && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => void act('open-all-bookmarks', { id: row.id })}
                  >
                    Open all
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  onClick={() => void act('show-bookmark-editor', { mode: 'edit', id: row.id })}
                >
                  Edit
                </button>
                <button
                  className="btn btn-ghost bm-remove"
                  title="Delete"
                  aria-label="Delete"
                  onClick={() => void remove(row)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {found.length > limit && (
        <button
          className="btn btn-ghost bm-more"
          onClick={() => setMore({ key: queryKey, limit: limit + PAGE })}
        >
          Show {Math.min(PAGE, found.length - limit)} more ({found.length - limit} left)
        </button>
      )}
    </div>
  )
}
