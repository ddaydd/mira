// Right-click menu of the bookmarks bar, laid out like Chrome's: on a favorite or
// a folder, and on the empty part of the bar. Pure: which entries each gets, each a
// registry command with its params, so the native popup (profiles.ts) only
// converts and the list is unit-tested without Electron. Chrome entries Mira has
// no feature for (incognito, split view, tab groups, bookmark manager, apps
// shortcut) are left out rather than shown dead.

import type { BookmarkNode } from './bookmark-store'
import { urlsOf } from './bookmark-edit'

export type BookmarkMenuEntry =
  | { type: 'separator' }
  | {
      type: 'command'
      label: string
      command: string
      params: Record<string, unknown>
      /** Greyed out (Paste with nothing to paste, Open All on an empty folder). */
      enabled?: boolean
      /** Ask before running: a folder delete takes its whole subtree along. */
      confirm?: { message: string; detail: string; button: string }
    }
  | {
      type: 'radio'
      label: string
      checked: boolean
      command: string
      params: Record<string, unknown>
    }
  | { type: 'submenu'; label: string; items: BookmarkMenuEntry[] }

/** What the menu needs beyond the node: the bar state and the clipboard. */
export interface BookmarkMenuState {
  /** Paste has something to insert (bookmark-edit.ts pasteSource). */
  canPaste: boolean
  barVisible: boolean
}

/** Chrome asks before opening more tabs than this in one go. */
const OPEN_ALL_CONFIRM_ABOVE = 15

const separator: BookmarkMenuEntry = { type: 'separator' }

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Bookmarks Bar ▸ Always Show / Always Hide. */
function barSubmenu(state: BookmarkMenuState): BookmarkMenuEntry {
  return {
    type: 'submenu',
    label: 'Bookmarks Bar',
    items: [
      {
        type: 'radio',
        label: 'Always Show',
        checked: state.barVisible,
        command: 'toggle-bookmarks-bar',
        params: { visible: true }
      },
      {
        type: 'radio',
        label: 'Always Hide',
        checked: !state.barVisible,
        command: 'toggle-bookmarks-bar',
        params: { visible: false }
      }
    ]
  }
}

/** Paste / Add Page… / Add Folder…, inserting after `afterId` (end of the bar
 * without one). */
function pasteEntry(state: BookmarkMenuState, afterId?: string): BookmarkMenuEntry {
  return {
    type: 'command',
    label: 'Paste',
    command: 'paste-bookmark',
    params: afterId ? { afterId } : {},
    enabled: state.canPaste
  }
}

function addEntries(afterId?: string): BookmarkMenuEntry[] {
  const at = afterId ? { afterId } : {}
  return [
    {
      type: 'command',
      label: 'Add Page…',
      command: 'show-bookmark-editor',
      params: { mode: 'add-page', ...at }
    },
    {
      type: 'command',
      label: 'Add Folder…',
      command: 'show-bookmark-editor',
      params: { mode: 'add-folder', ...at }
    }
  ]
}

/** Open All / Open All in New Window on a folder. */
function openAllEntries(node: BookmarkNode): BookmarkMenuEntry[] {
  const count = urlsOf(node).length
  const confirm =
    count > OPEN_ALL_CONFIRM_ABOVE
      ? {
          message: `Open ${plural(count, 'tab')}?`,
          detail: `“${node.title || 'Untitled'}” holds ${plural(count, 'bookmark')}.`,
          button: 'Open'
        }
      : undefined
  const entry = (label: string, command: string): BookmarkMenuEntry => ({
    type: 'command',
    label: count > 0 ? `${label} (${count})` : label,
    command,
    params: { id: node.id },
    enabled: count > 0,
    ...(confirm ? { confirm } : {})
  })
  return [
    entry('Open All', 'open-all-bookmarks'),
    entry('Open All in New Window', 'open-bookmarks-in-new-window')
  ]
}

export function buildBookmarkMenu(
  node: BookmarkNode,
  state: BookmarkMenuState = { canPaste: false, barVisible: true }
): BookmarkMenuEntry[] {
  const open: BookmarkMenuEntry[] =
    node.kind === 'url'
      ? [
          {
            type: 'command',
            label: 'Open in New Tab',
            command: 'navigate',
            params: { url: node.url, newTab: true }
          },
          {
            type: 'command',
            label: 'Open in New Window',
            command: 'open-bookmarks-in-new-window',
            params: { id: node.id }
          }
        ]
      : openAllEntries(node)

  const remove: BookmarkMenuEntry = {
    type: 'command',
    label: 'Delete',
    command: 'remove-bookmark',
    params: { id: node.id }
  }
  if (node.kind === 'folder' && node.children.length > 0) {
    const count = urlsOf(node).length
    remove.confirm = {
      message: `Delete the folder “${node.title || 'Untitled'}”?`,
      detail: `It holds ${plural(count, 'bookmark')}, deleted with it.`,
      button: 'Delete'
    }
  }

  return [
    ...open,
    separator,
    {
      type: 'command',
      label: node.kind === 'url' ? 'Edit…' : 'Rename…',
      command: 'show-bookmark-editor',
      params: { mode: 'edit', id: node.id }
    },
    separator,
    { type: 'command', label: 'Cut', command: 'cut-bookmark', params: { id: node.id } },
    { type: 'command', label: 'Copy', command: 'copy-bookmark', params: { id: node.id } },
    pasteEntry(state, node.id),
    separator,
    remove,
    separator,
    ...addEntries(node.id),
    separator,
    barSubmenu(state)
  ]
}

/** Right-click on the bar outside any item. */
export function buildBarMenu(state: BookmarkMenuState): BookmarkMenuEntry[] {
  return [...addEntries(), separator, pasteEntry(state), separator, barSubmenu(state)]
}
