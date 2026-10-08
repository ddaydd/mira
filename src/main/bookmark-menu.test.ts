import { describe, it, expect } from 'vitest'
import { buildBookmarkMenu } from './bookmark-menu'

describe('buildBookmarkMenu', () => {
  it('offers open / new tab / copy / rename / delete on a favorite', () => {
    const menu = buildBookmarkMenu({ id: 'a', kind: 'url', title: 'A', url: 'https://a.test/' })
    expect(menu.map((e) => (e.type === 'command' ? e.label : '—'))).toEqual([
      'Open',
      'Open in New Tab',
      'Copy Link',
      '—',
      'Rename…',
      'Delete'
    ])
    expect(menu[1]).toMatchObject({
      command: 'navigate',
      params: { url: 'https://a.test/', newTab: true }
    })
    expect(menu[2]).toMatchObject({ command: 'copy-text', params: { text: 'https://a.test/' } })
    expect(menu[5]).toMatchObject({ command: 'remove-bookmark', params: { id: 'a' } })
  })

  it('asks before deleting a folder that holds bookmarks, counting nested ones', () => {
    const menu = buildBookmarkMenu({
      id: 'f',
      kind: 'folder',
      title: 'Dev',
      children: [
        { id: 'a', kind: 'url', title: 'A', url: 'https://a.test/' },
        {
          id: 'g',
          kind: 'folder',
          title: 'Sub',
          children: [{ id: 'b', kind: 'url', title: 'B', url: 'https://b.test/' }]
        }
      ]
    })
    expect(menu.map((e) => e.type === 'command' && e.label)).toEqual(['Rename…', 'Delete Folder'])
    expect(menu[1]).toMatchObject({
      confirm: {
        message: 'Delete the folder “Dev”?',
        detail: 'It holds 2 bookmarks, deleted with it.'
      }
    })
  })

  it('deletes an empty folder without asking', () => {
    const menu = buildBookmarkMenu({ id: 'f', kind: 'folder', title: 'Empty', children: [] })
    expect(menu[1]).not.toHaveProperty('confirm')
  })
})
