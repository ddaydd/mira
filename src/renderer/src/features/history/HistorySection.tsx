import { useEffect, useMemo, useState } from 'react'
import { groupByDay, historyHost, visitTime, type HistoryRow } from './history-days'

// Settings → History (Linux fork, Ctrl+H): the pages this window's profile
// visited, grouped by day, newest first — the profile's history.json, kept up to
// 5000 pages. Searchable (title or url), one × per page, Clear all. Every action
// is a registry command (list-history / search-history / delete-history-entry /
// clear-history). Rows share the bookmark manager's look (bm-* classes).

async function run(name: string, params?: unknown): Promise<Record<string, unknown>> {
  return (await window.mira.command(name, params)) as Record<string, unknown>
}

/** Max pages asked of main (list-history's own cap). */
const FETCH = 1000
/** Rows rendered at once, "Show more" adds as many. */
const PAGE = 200

function Icon({
  url,
  icons
}: {
  url: string
  icons: Record<string, string | null>
}): React.JSX.Element {
  const [broken, setBroken] = useState(false)
  const src = icons[url]
  if (src && !broken)
    return <img className="bm-icon" src={src} alt="" onError={() => setBroken(true)} />
  return <span className="bm-icon bm-letter">{(historyHost(url)[0] ?? '?').toUpperCase()}</span>
}

export function HistorySection(): React.JSX.Element {
  const [entries, setEntries] = useState<HistoryRow[]>([])
  const [text, setText] = useState('')
  const [more, setMore] = useState<{ key: string; limit: number }>({ key: '', limit: PAGE })
  const [icons, setIcons] = useState<Record<string, string | null>>({})
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [tick, setTick] = useState(0)

  // Reload on every search change, on a 30 s tick (pages visited meanwhile) and
  // after each action (tick bump).
  useEffect(() => {
    let alive = true
    const q = text.trim()
    const req = q
      ? run('search-history', { query: q, limit: FETCH })
      : run('list-history', { limit: FETCH })
    void req.then((res) => {
      if (!alive) return
      if (res.ok) {
        setEntries((res.entries as HistoryRow[]) ?? [])
        setError(null)
      } else setError(String(res.error))
      setNow(Date.now())
    })
    return () => {
      alive = false
    }
  }, [text, tick])

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000)
    const onFocus = (): void => setTick((t) => t + 1)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const limit = more.key === text ? more.limit : PAGE
  const shownRows = useMemo(
    () => [...entries].sort((a, b) => b.lastVisited - a.lastVisited).slice(0, limit),
    [entries, limit]
  )
  const days = useMemo(() => groupByDay(shownRows, now), [shownRows, now])

  // Icons of the rows on screen only, asked again when that set changes.
  const shownUrls = shownRows.map((r) => r.url).join('\n')
  useEffect(() => {
    const urls = shownUrls ? shownUrls.split('\n').filter((u) => !(u in icons)) : []
    if (urls.length === 0) return
    let alive = true
    void run('bookmark-favicons', { urls: urls.slice(0, 500) }).then((res) => {
      if (alive && res.ok) setIcons((prev) => ({ ...prev, ...(res.icons as typeof icons) }))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownUrls])

  const act = async (name: string, params?: unknown): Promise<void> => {
    const res = await run(name, params)
    setError(res.ok ? null : String(res.error))
    setTick((t) => t + 1)
  }

  // Click = new foreground tab; Ctrl/middle click = background tab, as in Chrome.
  const open = (url: string, background: boolean): void => {
    void act('new-tab', { url, background })
  }

  const clearAll = (): void => {
    if (window.confirm('Clear the whole browsing history of this profile?')) {
      void act('clear-history')
    }
  }

  return (
    <div className="settings-section bm-section">
      <p className="settings-hint">
        Pages visited in this profile, newest first (up to 5000 kept). Click to open in a new tab,
        Ctrl+click or middle click to open it in the background.
      </p>
      <div className="bm-toolbar">
        <input
          className="settings-input bm-search"
          type="search"
          placeholder="Search history"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
        />
        {entries.length > 0 && !text && (
          <button className="btn btn-ghost" onClick={clearAll}>
            Clear all
          </button>
        )}
      </div>
      {error && <p className="settings-error">{error}</p>}
      {days.length === 0 ? (
        <p className="settings-hint">{text ? 'No page matches.' : 'No history yet.'}</p>
      ) : (
        days.map((day) => (
          <section key={day.key} className="hist-day">
            <h3 className="hist-day-label">{day.label}</h3>
            <ul className="bm-list">
              {day.rows.map((row) => (
                <li key={row.url} className="bm-item">
                  <span className="bm-date hist-time">{visitTime(row.lastVisited)}</span>
                  <Icon url={row.url} icons={icons} />
                  <div className="bm-main">
                    <button
                      className="bm-title"
                      title={row.url}
                      onClick={(e) => open(row.url, e.ctrlKey || e.metaKey)}
                      onAuxClick={(e) => {
                        if (e.button === 1) open(row.url, true)
                      }}
                    >
                      {row.title || row.url}
                    </button>
                    <span className="bm-meta" title={row.url}>
                      {historyHost(row.url)}
                    </span>
                  </div>
                  <div className="bm-actions">
                    <button
                      className="btn btn-ghost bm-remove"
                      title="Remove from history"
                      aria-label="Remove from history"
                      onClick={() => void act('delete-history-entry', { url: row.url })}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {entries.length > limit && (
        <button
          className="btn btn-ghost bm-more"
          onClick={() => setMore({ key: text, limit: limit + PAGE })}
        >
          Show more ({entries.length - limit} left)
        </button>
      )}
    </div>
  )
}
