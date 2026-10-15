import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {} }))

import { parseBookmarkEditorAnswer, renderBookmarkEditorHtml } from './bookmark-editor'

describe('renderBookmarkEditorHtml', () => {
  it('has a url field for a page, not for a folder, and escapes values', () => {
    const page = renderBookmarkEditorHtml({
      mode: 'edit-url',
      title: '<b>"x"',
      url: 'https://a.test/'
    })
    expect(page).toContain('Edit Bookmark')
    expect(page).toContain('id="url"')
    expect(page).toContain('&lt;b&gt;&quot;x&quot;')
    const dir = renderBookmarkEditorHtml({ mode: 'add-folder', title: '', url: 'ignored' })
    expect(dir).toContain('Add Folder')
    expect(dir).not.toContain('id="url"')
  })
})

describe('parseBookmarkEditorAnswer', () => {
  it('reads a page and a folder answer', () => {
    const page = JSON.stringify({ title: ' A ', url: ' a.test ' })
    expect(parseBookmarkEditorAnswer(page, 'add-page')).toEqual({ title: 'A', url: 'a.test' })
    const dir = JSON.stringify({ title: 'Dev' })
    expect(parseBookmarkEditorAnswer(dir, 'edit-folder')).toEqual({ title: 'Dev' })
  })

  it('keeps an empty page name (icon only) but needs a url, and a folder name', () => {
    const noName = JSON.stringify({ title: '', url: 'https://a.test/' })
    expect(parseBookmarkEditorAnswer(noName, 'edit-url')).toEqual({
      title: '',
      url: 'https://a.test/'
    })
    expect(
      parseBookmarkEditorAnswer(JSON.stringify({ title: 'A', url: ' ' }), 'add-page')
    ).toBeNull()
    expect(parseBookmarkEditorAnswer(JSON.stringify({ title: ' ' }), 'add-folder')).toBeNull()
  })

  it('treats a cancel or garbage as null', () => {
    expect(parseBookmarkEditorAnswer('', 'add-page')).toBeNull()
    expect(parseBookmarkEditorAnswer('{', 'add-page')).toBeNull()
    expect(parseBookmarkEditorAnswer(42, 'add-page')).toBeNull()
  })
})
