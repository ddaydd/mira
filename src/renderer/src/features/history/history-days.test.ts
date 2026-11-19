import { describe, expect, it } from 'vitest'
import { dayLabel, groupByDay, historyHost, type HistoryRow } from './history-days'

const at = (y: number, m: number, d: number, h = 12, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime()
const row = (url: string, lastVisited: number): HistoryRow => ({
  url,
  title: url,
  lastVisited,
  visitCount: 1
})
const NOW = at(2026, 11, 19, 15)

describe('dayLabel', () => {
  it('names today and yesterday', () => {
    expect(dayLabel(at(2026, 11, 19, 0), NOW)).toBe('Today')
    expect(dayLabel(at(2026, 11, 18, 0), NOW)).toBe('Yesterday')
  })
  it('spells out older days with their date', () => {
    const label = dayLabel(at(2026, 11, 12, 0), NOW)
    expect(label).not.toBe('Today')
    expect(label).toContain('2026')
  })
  it('knows yesterday across a DST change (Sunday 25 h long)', () => {
    expect(dayLabel(at(2026, 10, 25, 0), at(2026, 10, 26, 0, 30))).toBe('Yesterday')
  })
})

describe('groupByDay', () => {
  it('groups by local day, newest day and newest visit first', () => {
    const days = groupByDay(
      [
        row('https://old.test', at(2026, 11, 12, 9)),
        row('https://a.test', at(2026, 11, 19, 8)),
        row('https://b.test', at(2026, 11, 19, 14)),
        row('https://y.test', at(2026, 11, 18, 23, 59))
      ],
      NOW
    )
    expect(days.map((d) => d.label.slice(0, 9))).toEqual([
      'Today',
      'Yesterday',
      days[2].label.slice(0, 9)
    ])
    expect(days[0].rows.map((r) => r.url)).toEqual(['https://b.test', 'https://a.test'])
    expect(days[2].rows.map((r) => r.url)).toEqual(['https://old.test'])
  })
  it('re-sorts relevance-ordered search results by date', () => {
    const days = groupByDay([row('https://1.test', 1), row('https://2.test', NOW)], NOW)
    expect(days[0].rows[0].url).toBe('https://2.test')
  })
  it('is empty for no rows', () => {
    expect(groupByDay([], NOW)).toEqual([])
  })
})

describe('historyHost', () => {
  it('drops www. and falls back to the raw string', () => {
    expect(historyHost('https://www.example.com/a')).toBe('example.com')
    expect(historyHost('not a url')).toBe('not a url')
  })
})
