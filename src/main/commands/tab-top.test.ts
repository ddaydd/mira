import { describe, it, expect } from 'vitest'
import { createCommandRegistry } from './index'
import { makeContext } from './fake-context'
import { topIndexOf } from './tab-top'

describe('topIndexOf (pure)', () => {
  const tabs = [
    { id: 'p1', pinned: true },
    { id: 'p2', pinned: true },
    { id: 'a', folderId: 'f1' },
    { id: 'l1', folderId: null },
    { id: 'b', folderId: 'f1' },
    { id: 'l2' },
    { id: 'c', folderId: 'f2' }
  ]

  it('sends a loose tab to the first loose slot, not above a foldered tab', () => {
    expect(topIndexOf(tabs, 'l2')).toBe(3)
  })

  it('keeps a foldered tab inside its folder', () => {
    expect(topIndexOf(tabs, 'b')).toBe(2)
    expect(topIndexOf(tabs, 'c')).toBe(6)
  })

  it('keeps a pinned tab inside the pinned block', () => {
    expect(topIndexOf(tabs, 'p2')).toBe(0)
  })

  it('returns the own index of a tab already first, and null on an unknown id', () => {
    expect(topIndexOf(tabs, 'l1')).toBe(3)
    expect(topIndexOf(tabs, 'nope')).toBeNull()
  })
})

describe('move-tab-to-top command', () => {
  const order = (ctx: ReturnType<typeof makeContext>['ctx']): string[] =>
    ctx.listTabs().tabs.map((t) => t.id)

  it('moves the active tab to the head of the loose tabs without changing focus', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    registry.execute('new-tab', {}, ctx)
    registry.execute('new-tab', {}, ctx)
    const before = order(ctx)
    const last = before[before.length - 1]
    registry.execute('select-tab', { id: last }, ctx)

    expect(registry.execute('move-tab-to-top', {}, ctx)).toEqual({
      ok: true,
      id: last,
      moved: true,
      toIndex: 0
    })
    expect(order(ctx)).toEqual([last, ...before.slice(0, -1)])
    expect(ctx.listTabs().activeId).toBe(last)
  })

  it('reports moved:false when the tab is already first', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    const first = order(ctx)[0]
    expect(registry.execute('move-tab-to-top', { id: first }, ctx)).toEqual({
      ok: true,
      id: first,
      moved: false,
      toIndex: 0
    })
  })

  it('moves a foldered tab to the head of its folder, never out of it', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    registry.execute('new-tab', {}, ctx)
    registry.execute('new-tab', {}, ctx)
    const [x, y, z] = order(ctx)
    const { id: folderId } = registry.execute(
      'create-tab-folder',
      { title: 'Work', tabId: y },
      ctx
    ) as unknown as { id: string }
    registry.execute('move-tab-to-folder', { tabId: z, folderId }, ctx)

    expect(registry.execute('move-tab-to-top', { id: z }, ctx)).toMatchObject({
      ok: true,
      moved: true
    })
    expect(order(ctx)).toEqual([x, z, y])
    expect(ctx.listTabs().tabs.find((t) => t.id === z)?.folderId).toBe(folderId)
  })

  it('rejects a bad or unknown id', () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    expect(registry.execute('move-tab-to-top', { id: '' }, ctx)).toEqual({
      ok: false,
      error: '"id" must be a non-empty string'
    })
    expect(registry.execute('move-tab-to-top', { id: 'nope' }, ctx)).toEqual({
      ok: false,
      error: 'unknown tab: nope'
    })
  })
})
