import { describe, it, expect } from 'vitest'
import { createCommandRegistry } from '.'
import { makeContext } from './fake-context'

describe('copy-text', () => {
  it('writes the text to the clipboard and flashes a toast', () => {
    const { ctx, clipboardWrites, toasts } = makeContext()
    const registry = createCommandRegistry()
    expect(registry.execute('copy-text', { text: 'https://example.com/a' }, ctx)).toEqual({
      ok: true
    })
    expect(clipboardWrites).toEqual(['https://example.com/a'])
    expect(toasts).toEqual(['Copied!'])
  })

  it('refuses an empty or missing text', () => {
    const { ctx, clipboardWrites } = makeContext()
    const registry = createCommandRegistry()
    const error = { ok: false, error: '"text" must be a non-empty string' }
    expect(registry.execute('copy-text', { text: '' }, ctx)).toEqual(error)
    expect(registry.execute('copy-text', {}, ctx)).toEqual(error)
    expect(clipboardWrites).toEqual([])
  })
})
