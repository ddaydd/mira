import { describe, expect, it } from 'vitest'
import { AgentActivity, tabsTouchedBy } from './agent-activity'

describe('tabsTouchedBy', () => {
  it('takes the tab named in params', () => {
    expect(tabsTouchedBy('exec-js', { code: '1', tabId: 't1' }, { ok: true })).toEqual(['t1'])
  })

  it('takes the tab a command created', () => {
    expect(tabsTouchedBy('new-tab', { url: 'x' }, { ok: true, id: 't2' })).toEqual(['t2'])
  })

  it('falls back to the active tab for a tab-bound command without a tab', () => {
    expect(tabsTouchedBy('exec-js', { code: '1' }, { ok: true }, 'active')).toEqual(['active'])
  })

  it('never falls back for a command that is not about a tab', () => {
    expect(tabsTouchedBy('list-tabs', {}, { ok: true, tabs: [] }, 'active')).toEqual([])
    expect(tabsTouchedBy('get-status', undefined, { ok: true }, 'active')).toEqual([])
  })

  it('ignores failed requests and closed tabs', () => {
    expect(tabsTouchedBy('exec-js', { tabId: 't1' }, { ok: false, error: 'x' })).toEqual([])
    expect(tabsTouchedBy('close-tab', { id: 't1' }, { ok: true, id: 't1' })).toEqual([])
  })

  it('does not count the same tab twice', () => {
    expect(tabsTouchedBy('navigate', { tabId: 't1' }, { ok: true, id: 't1' })).toEqual(['t1'])
  })
})

describe('AgentActivity', () => {
  it('keeps a tab active for the window, then expires it', () => {
    const a = new AgentActivity(1000)
    a.touch('t1', 0)
    expect(a.isActive('t1', 999)).toBe(true)
    expect(a.nextExpiryIn(400)).toBe(600)
    expect(a.expire(999)).toEqual([])
    expect(a.isActive('t1', 1000)).toBe(false)
    expect(a.expire(1000)).toEqual(['t1'])
    expect(a.nextExpiryIn(1000)).toBeNull()
  })

  it('a new command extends the window', () => {
    const a = new AgentActivity(1000)
    a.touch('t1', 0)
    a.touch('t1', 800)
    expect(a.isActive('t1', 1500)).toBe(true)
  })
})
