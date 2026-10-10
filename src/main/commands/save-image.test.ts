import { describe, it, expect } from 'vitest'
import { createCommandRegistry } from '.'
import { makeContext } from './fake-context'

describe('save-image', () => {
  it('saves into the profile folder and returns the path', async () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    expect(await registry.execute('save-image', { url: 'https://x.test/a.png' }, ctx)).toEqual({
      ok: true,
      file: '/fake/images/a.png'
    })
  })

  it('rejects a missing url or a bad tabId', async () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    expect(await registry.execute('save-image', {}, ctx)).toEqual({
      ok: false,
      error: 'missing "url"'
    })
    expect(
      await registry.execute('save-image', { url: 'https://x.test/a.png', tabId: 3 }, ctx)
    ).toEqual({
      ok: false,
      error: 'invalid "tabId"'
    })
  })
})

describe('save-image-as', () => {
  it('returns the chosen file, and remembers its folder for the profile', async () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    expect(await registry.execute('save-image-as', { url: 'https://x.test/b.jpg' }, ctx)).toEqual({
      ok: true,
      file: '/fake/picked/b.jpg'
    })
    expect(registry.execute('get-image-save-dir', {}, ctx)).toEqual({
      ok: true,
      dir: '/fake/picked'
    })
  })

  it('reports a cancelled dialog without failing', async () => {
    const { ctx } = makeContext()
    const registry = createCommandRegistry()
    expect(
      await registry.execute('save-image-as', { url: 'https://x.test/cancel.png' }, ctx)
    ).toEqual({ ok: true, cancelled: true })
  })
})
