import { useEffect, useState } from 'react'
import { timeAgo } from '../audio-history/time-ago'
import { downloadPercent, downloadStatus, sourceHost, type DownloadRow } from './download-row'

// Settings → Downloads (Linux fork): every file Mira downloaded, newest first,
// kept across restarts (<userData>/downloads.json). Live: main pushes
// mira:downloads-changed on every progress tick. While the page shows, completed
// downloads are acknowledged, which clears the status bar's "✓ n" badge. Every
// action is a registry command.

async function run(name: string, params?: unknown): Promise<Record<string, unknown>> {
  return (await window.mira.command(name, params)) as Record<string, unknown>
}

export function DownloadsSection(): React.JSX.Element {
  const [list, setList] = useState<DownloadRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = (): void => {
    void run('list-downloads').then((res) => {
      if (res.ok) setList((res.downloads as DownloadRow[]) ?? [])
      else setError(String(res.error))
      setNow(Date.now())
    })
  }

  useEffect(() => {
    // Mounted only while the page is on screen: a file landing meanwhile is seen.
    const refresh = (): void => {
      load()
      void run('mark-downloads-seen')
    }
    refresh()
    const unsub = window.mira.onDownloadsChanged(refresh)
    // Keeps "x min ago" fresh and notices a file deleted from the folder.
    const tick = setInterval(load, 30_000)
    return () => {
      unsub()
      clearInterval(tick)
    }
  }, [])

  const act = async (name: string, id?: string): Promise<void> => {
    const res = await run(name, id ? { id } : undefined)
    setError(res.ok ? null : String(res.error))
    load()
  }

  const finished = list.some((d) => d.state !== 'progressing')

  return (
    <div className="settings-section">
      <p className="settings-hint">
        Every file Mira downloaded, newest first. Files are saved straight to your Downloads folder.
        Removing an entry from this list leaves the file on disk.
      </p>
      <div className="settings-section-head">
        <button className="btn btn-ghost" onClick={() => void act('open-downloads-folder')}>
          Open Downloads folder
        </button>
        {finished && (
          <button className="btn btn-ghost" onClick={() => void act('clear-downloads')}>
            Clear list
          </button>
        )}
      </div>
      {error && <p className="settings-error">{error}</p>}
      {list.length === 0 ? (
        <p className="settings-hint">No download yet.</p>
      ) : (
        <ul className="downloads-list">
          {list.map((d) => {
            const percent = downloadPercent(d)
            const gone = d.state !== 'completed' || d.missing
            return (
              <li key={d.id} className={`downloads-item${gone ? ' gone' : ''}`}>
                <div className="downloads-main">
                  {d.state === 'completed' && !d.missing ? (
                    <button
                      className="downloads-name"
                      title={d.savePath}
                      onClick={() => void act('open-download', d.id)}
                    >
                      {d.filename}
                    </button>
                  ) : (
                    <span className="downloads-name" title={d.savePath}>
                      {d.filename}
                    </span>
                  )}
                  <span className="downloads-meta">
                    {downloadStatus(d)} · <span title={d.url}>{sourceHost(d.url)}</span> ·{' '}
                    <span title={new Date(d.startedAt).toLocaleString()}>
                      {timeAgo(d.startedAt, now)}
                    </span>
                  </span>
                  {d.state === 'progressing' && (
                    <div className="downloads-bar">
                      <div
                        className={`downloads-bar-fill${percent == null ? ' indeterminate' : ''}`}
                        style={{ width: `${percent ?? 30}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="downloads-actions">
                  {d.state === 'progressing' ? (
                    <button
                      className="btn btn-ghost"
                      onClick={() => void act('cancel-download', d.id)}
                    >
                      Cancel
                    </button>
                  ) : (
                    <>
                      {d.state === 'completed' && !d.missing && (
                        <button
                          className="btn btn-ghost"
                          onClick={() => void act('reveal-download', d.id)}
                        >
                          Show in folder
                        </button>
                      )}
                      <button
                        className="btn btn-ghost downloads-remove"
                        title="Remove from list"
                        aria-label="Remove from list"
                        onClick={() => void act('remove-download', d.id)}
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
