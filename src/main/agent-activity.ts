// Which tabs an agent (Claude through the `mira` CLI, any socket client) is
// working in right now — the logic behind the small robot icon on a tab row.
// Chrome shows the same thing by moving the tab into a coloured group; here the
// tab stays where the user put it and only gains an icon after its title.
//
// A tab counts as "worked in" for ACTIVE_MS after the last socket command that
// named it (params.tabId / params.id) or created it (the reply's id / tabId).
// A tab-bound command sent with no tab at all acts on the target window's active
// tab: profiles.ts resolves that one and passes it as `fallbackTabId`.
//
// Pure: no Electron, no timers. profiles.ts owns the clock and the re-push at
// expiry (tout testable).

/** How long a tab keeps the icon after the agent's last command on it. Long
 * enough to bridge the pauses between two commands of one task (an agent
 * thinks between calls), short enough to clear soon after it is done. */
export const AGENT_ACTIVE_MS = 10_000

/** Commands that act on a tab even when no tabId is sent: they fall back to
 * the target window's active tab (the CLI's TAB_BOUND list, plus navigation). */
export const TAB_BOUND_COMMANDS = new Set([
  'exec-js',
  'collect-media',
  'download-media',
  'press-key',
  'click',
  'wait-for',
  'get-console',
  'screenshot',
  'snapshot',
  'type-text',
  'select-option',
  'navigate',
  'reload',
  'go-back',
  'go-forward'
])

/** Commands that name a tab only to get rid of it: no icon for a closed tab. */
const CLOSING_COMMANDS = new Set(['close-tab', 'close-tabs'])

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function field(obj: unknown, key: string): string | null {
  return obj && typeof obj === 'object' ? str((obj as Record<string, unknown>)[key]) : null
}

/**
 * The tab ids one socket request touched. `response` is the reply as sent
 * (`{ok, ...}`); a failed request touches nothing. Ids that are not tabs (a
 * folder id, a bookmark id) are harmless: no tab carries them.
 */
export function tabsTouchedBy(
  command: string | null,
  params: unknown,
  response: unknown,
  fallbackTabId: string | null = null
): string[] {
  if (!command || CLOSING_COMMANDS.has(command)) return []
  if (!response || typeof response !== 'object' || (response as { ok?: unknown }).ok !== true) {
    return []
  }
  const ids = new Set<string>()
  for (const id of [
    field(params, 'tabId'),
    field(params, 'id'),
    field(response, 'tabId'),
    field(response, 'id'),
    field((response as { result?: unknown }).result, 'tabId')
  ]) {
    if (id) ids.add(id)
  }
  if (ids.size === 0 && fallbackTabId && TAB_BOUND_COMMANDS.has(command)) ids.add(fallbackTabId)
  return [...ids]
}

/** Last agent command time per tab id. */
export class AgentActivity {
  private readonly lastAt = new Map<string, number>()

  constructor(private readonly activeMs = AGENT_ACTIVE_MS) {}

  touch(tabId: string, now: number): void {
    this.lastAt.set(tabId, now)
  }

  isActive(tabId: string, now: number): boolean {
    const at = this.lastAt.get(tabId)
    return at !== undefined && now - at < this.activeMs
  }

  /** Forget expired entries; returns the ids that just expired (to re-push). */
  expire(now: number): string[] {
    const gone: string[] = []
    for (const [id, at] of this.lastAt) {
      if (now - at >= this.activeMs) {
        this.lastAt.delete(id)
        gone.push(id)
      }
    }
    return gone
  }

  /** Milliseconds until the next entry expires, or null when none is tracked. */
  nextExpiryIn(now: number): number | null {
    let min: number | null = null
    for (const at of this.lastAt.values()) {
      const left = Math.max(0, at + this.activeMs - now)
      if (min === null || left < min) min = left
    }
    return min
  }
}
