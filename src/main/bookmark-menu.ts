// Right-click menu of a bookmarks-bar item. Pure: which entries a favorite or a
// folder gets, each a registry command with its params, so the native popup
// (profiles.ts) only converts and the list is unit-tested without Electron.

import type { BookmarkNode } from './bookmark-store'

export type BookmarkMenuEntry =
  | { type: 'separator' }
  | {
      type: 'command'
      label: string
      command: string
      params: Record<string, unknown>
      /** Ask before running: a folder delete takes its whole subtree along. */
      confirm?: { message: string; detail: string; button: string }
    }

/** Count the url favorites under a node (itself included when it is one). */
function urlCount(node: BookmarkNode): number {
  return node.kind === 'url' ? 1 : node.children.reduce((n, c) => n + urlCount(c), 0)
}

export function buildBookmarkMenu(node: BookmarkNode): BookmarkMenuEntry[] {
  const rename: BookmarkMenuEntry = {
    type: 'command',
    label: 'Rename…',
    command: 'edit-bookmark',
    params: { id: node.id }
  }
  if (node.kind === 'url') {
    return [
      { type: 'command', label: 'Open', command: 'navigate', params: { url: node.url } },
      {
        type: 'command',
        label: 'Open in New Tab',
        command: 'navigate',
        params: { url: node.url, newTab: true }
      },
      { type: 'command', label: 'Copy Link', command: 'copy-text', params: { text: node.url } },
      { type: 'separator' },
      rename,
      { type: 'command', label: 'Delete', command: 'remove-bookmark', params: { id: node.id } }
    ]
  }
  const count = urlCount(node)
  const remove: BookmarkMenuEntry = {
    type: 'command',
    label: 'Delete Folder',
    command: 'remove-bookmark',
    params: { id: node.id }
  }
  if (count > 0 || node.children.length > 0) {
    remove.confirm = {
      message: `Delete the folder “${node.title || 'Untitled'}”?`,
      detail: `It holds ${count} bookmark${count === 1 ? '' : 's'}, deleted with it.`,
      button: 'Delete'
    }
  }
  return [rename, remove]
}
