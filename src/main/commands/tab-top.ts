// Tab-top domain: "this tab matters now" — send a tab to the head of its own
// group in the strip. The strip order is how priorities are kept, so one key
// promotes the tab being looked at instead of a drag.
//
// A group is what the sidebar shows as one list: the pinned grid, one folder, or
// the loose tabs. The tab never changes group (a foldered tab stays in its
// folder, a pinned tab stays pinned), and focus does not move.
//
// Where the tab must land is pure (`topIndexOf`, unit-tested here);
// ProfileManager applies it through the same reorder as `move-tab`.

import { type CommandMap, fail } from './registry'
import type { CommandContext } from './context'

/** The fields that decide which group a tab belongs to. */
export interface TabGroupMember {
  id: string
  pinned?: boolean
  folderId?: string | null
}

/** Pure: the index (in the full strip array) tab `id` must end at to be first of
 * its group — the index of the group's current first member. Returns null on an
 * unknown id. A tab already first gets its own index (a no-op move). */
export function topIndexOf(tabs: readonly TabGroupMember[], id: string): number | null {
  const tab = tabs.find((t) => t.id === id)
  if (!tab) return null
  const folderId = tab.folderId ?? null
  const sameGroup = (t: TabGroupMember): boolean =>
    tab.pinned === true ? t.pinned === true : t.pinned !== true && (t.folderId ?? null) === folderId
  return tabs.findIndex(sameGroup)
}

/** Tab-top capability slice. `moveTabToTop` targets the given tab, else the
 * active one. `moved` is false when the tab was already first of its group;
 * `id` is null when there is no such tab. */
export interface TabTopContext {
  moveTabToTop: (tabId?: string) => { id: string | null; moved: boolean; toIndex: number }
}

export const tabTopCommands: CommandMap<CommandContext> = {
  // Cmd+Alt+Up (Tab menu, palette, socket, MCP): move a tab to the head of its
  // group. `id` omitted → the active tab.
  'move-tab-to-top': (ctx, params) => {
    const { id } = (params ?? {}) as { id?: unknown }
    if (id !== undefined && (typeof id !== 'string' || id === '')) {
      return { ok: false, error: '"id" must be a non-empty string' }
    }
    try {
      const result = ctx.moveTabToTop(id)
      if (result.id === null)
        return { ok: false, error: id ? `unknown tab: ${id}` : 'no active tab' }
      return { ok: true, ...result }
    } catch (error) {
      return fail(error)
    }
  }
}
