import { describe, it, expect } from 'vitest'
import { createCommandRegistry } from '.'
import { makeContext } from './fake-context'

describe('ui-state', () => {
  it('answers the window state plus a readable summary', () => {
    const { ctx } = makeContext()
    const res = createCommandRegistry().execute('ui-state', {}, ctx) as unknown as {
      ok: boolean
      windowId: string
      text: string
    }
    expect(res.ok).toBe(true)
    expect(res.windowId).toBe('fake-window')
    expect(res.text).toContain('window fake-window')
  })

  it('reports an unknown window and refuses a blank id', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    expect(registry.execute('ui-state', { windowId: 'nope' }, ctx)).toMatchObject({ ok: false })
    expect(registry.execute('ui-state', { windowId: ' ' }, ctx)).toEqual({
      ok: false,
      error: '"windowId" must be a non-empty string'
    })
  })
})
