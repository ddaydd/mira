import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CLOSED_WINDOW_LIMIT,
  ClosedWindowStore,
  lastClosedWindowAt,
  normalizeClosedWindows,
  pushClosedWindow,
  reopenWindowFirst,
  takeClosedWindow,
  type ClosedWindow
} from './closed-windows'

function closed(id: string, profileId = 'default', closedAt = 1, tabs = 1): ClosedWindow {
  return {
    profileId,
    closedAt,
    window: {
      windowId: id,
      tabs: Array.from({ length: tabs }, (_, i) => ({
        url: `https://e.org/${i}`,
        title: `T${i}`,
        favicon: null
      })),
      activeIndex: 0,
      panelCollapsed: false
    }
  }
}

describe('pushClosedWindow', () => {
  it('appends newest last', () => {
    const list = pushClosedWindow(pushClosedWindow([], closed('a')), closed('b'))
    expect(list.map((c) => c.window.windowId)).toEqual(['a', 'b'])
  })

  it('ignores a window with no tab', () => {
    expect(pushClosedWindow([], closed('a', 'default', 1, 0))).toEqual([])
  })

  it('replaces an older record of the same window', () => {
    const list = pushClosedWindow(
      [closed('a', 'default', 1), closed('b')],
      closed('a', 'default', 9)
    )
    expect(list.map((c) => [c.window.windowId, c.closedAt])).toEqual([
      ['b', 1],
      ['a', 9]
    ])
  })

  it('drops the oldest past the limit', () => {
    let list: ClosedWindow[] = []
    for (let i = 0; i < CLOSED_WINDOW_LIMIT + 3; i++) list = pushClosedWindow(list, closed(`w${i}`))
    expect(list).toHaveLength(CLOSED_WINDOW_LIMIT)
    expect(list[0].window.windowId).toBe('w3')
  })
})

describe('takeClosedWindow', () => {
  const list = [closed('a', 'p1'), closed('b', 'p2'), closed('c', 'p1')]

  it('takes the newest of any profile', () => {
    const { entry, rest } = takeClosedWindow(list)
    expect(entry?.window.windowId).toBe('c')
    expect(rest.map((c) => c.window.windowId)).toEqual(['a', 'b'])
  })

  it('takes the newest of one profile', () => {
    const { entry, rest } = takeClosedWindow(list, 'p2')
    expect(entry?.window.windowId).toBe('b')
    expect(rest.map((c) => c.window.windowId)).toEqual(['a', 'c'])
  })

  it('returns null when none matches', () => {
    expect(takeClosedWindow(list, 'p9')).toEqual({ entry: null, rest: list })
  })

  it('reports the newest close time of a profile', () => {
    expect(lastClosedWindowAt([closed('a', 'p1', 5), closed('b', 'p1', 7)], 'p1')).toBe(7)
    expect(lastClosedWindowAt([], 'p1')).toBeNull()
  })
})

describe('reopenWindowFirst', () => {
  it('reopens the window when it closed after the last tab', () => {
    expect(reopenWindowFirst(10, 20)).toBe(true)
    expect(reopenWindowFirst(null, 20)).toBe(true)
  })

  it('reopens the tab when it closed later, or no window is kept', () => {
    expect(reopenWindowFirst(30, 20)).toBe(false)
    expect(reopenWindowFirst(30, null)).toBe(false)
    expect(reopenWindowFirst(null, null)).toBe(false)
  })
})

describe('normalizeClosedWindows', () => {
  it('keeps valid entries and drops malformed ones', () => {
    const out = normalizeClosedWindows([
      closed('a'),
      { profileId: '', closedAt: 1, window: closed('b').window },
      { profileId: 'p', closedAt: 'x', window: closed('c').window },
      { profileId: 'p', closedAt: 1, window: { tabs: [] } },
      null
    ])
    expect(out.map((c) => c.window.windowId)).toEqual(['a'])
  })

  it('reads anything else as empty', () => {
    expect(normalizeClosedWindows({})).toEqual([])
  })
})

describe('ClosedWindowStore', () => {
  it('persists pushes and takes across instances', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'mira-cw-')), 'closed-windows.json')
    const a = new ClosedWindowStore(path)
    a.push(closed('w1', 'default', 1, 3))
    a.push(closed('w2', 'default', 2))
    const b = new ClosedWindowStore(path)
    expect(b.all().map((c) => c.window.windowId)).toEqual(['w1', 'w2'])
    expect(b.take()?.window.windowId).toBe('w2')
    expect(new ClosedWindowStore(path).all().map((c) => c.window.windowId)).toEqual(['w1'])
    expect(JSON.parse(readFileSync(path, 'utf8'))[0].window.tabs).toHaveLength(3)
  })

  it('starts empty on a corrupt file', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'mira-cw-')), 'closed-windows.json')
    writeFileSync(path, '{not json')
    expect(new ClosedWindowStore(path).all()).toEqual([])
  })
})
