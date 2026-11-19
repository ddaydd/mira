// Settings → History (Linux fork): the visited pages grouped by calendar day,
// newest first, as in Chrome's history page. Pure, so it is tested on its own.

export interface HistoryRow {
  url: string
  title: string
  lastVisited: number
  visitCount: number
}

export interface HistoryDay {
  /** Local midnight of the day, epoch ms (stable React key). */
  key: number
  label: string
  rows: HistoryRow[]
}

function midnight(at: number): number {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** "Today", "Yesterday", then "Wednesday, November 12, 2026" (local time). */
export function dayLabel(dayStart: number, now: number): string {
  const today = midnight(now)
  if (dayStart === today) return 'Today'
  // Not today - 24 h: a DST change makes one day 23 or 25 hours long.
  const yesterday = midnight(today - 12 * 3_600_000)
  if (dayStart === yesterday) return 'Yesterday'
  return new Date(dayStart).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/** Rows sorted newest first (a search returns them by relevance), then cut into
 * one group per local calendar day. Input untouched. */
export function groupByDay(rows: HistoryRow[], now: number): HistoryDay[] {
  const sorted = [...rows].sort((a, b) => b.lastVisited - a.lastVisited)
  const days: HistoryDay[] = []
  for (const row of sorted) {
    const key = midnight(row.lastVisited)
    const last = days[days.length - 1]
    if (last && last.key === key) last.rows.push(row)
    else days.push({ key, label: dayLabel(key, now), rows: [row] })
  }
  return days
}

/** Host shown under the title, without "www.". */
export function historyHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** "14:05" in local time. */
export function visitTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
