// Pure helpers for Settings → Downloads rows (tested on their own).

/** Mirrors DownloadRecord + `missing` (src/main/download-history.ts). */
export interface DownloadRow {
  id: string
  url: string
  filename: string
  savePath: string
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted'
  receivedBytes: number
  totalBytes: number
  paused: boolean
  startedAt: number
  updatedAt: number
  missing?: boolean
}

/** Human size like "4.2 MB" (same rounding as main's formatSize). */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${i === 0 ? Math.round(n) : Math.round(n * 10) / 10} ${units[i]}`
}

/** Host of the source URL, or the URL itself when it does not parse. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

/** The status part of a row's meta line: progress, size, or what went wrong. */
export function downloadStatus(row: DownloadRow): string {
  if (row.state === 'progressing') {
    const done = formatSize(row.receivedBytes)
    const progress =
      row.totalBytes > 0
        ? `${done} of ${formatSize(row.totalBytes)} (${Math.min(100, Math.round((row.receivedBytes / row.totalBytes) * 100))}%)`
        : done
    return row.paused ? `Paused — ${progress}` : progress
  }
  if (row.state === 'cancelled') return 'Cancelled'
  if (row.state === 'interrupted') return 'Failed'
  if (row.missing) return 'Deleted'
  return formatSize(row.totalBytes || row.receivedBytes)
}

/** Percent 0..100 for the progress bar, or null when the size is unknown. */
export function downloadPercent(row: DownloadRow): number | null {
  if (row.state !== 'progressing' || row.totalBytes <= 0) return null
  return Math.min(100, Math.round((row.receivedBytes / row.totalBytes) * 100))
}
