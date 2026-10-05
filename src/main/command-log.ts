// Who drove Mira from outside, and when.
//
// Why this exists: activation.log says THAT Mira came to the front and which of
// our frames asked, but not who was driving Mira at that moment. Several Claude
// sessions, the CLI, track and the second-instance handoff all share one socket,
// and every request now has to name itself (`client`, socket.ts). This module
// keeps that name: one line per socket request in `<userData>/command.log`, and
// the last request in memory so an activation can say "this came 40 ms after
// mira-cli session=… ran activate-tab".
//
// Pure formatting and the in-memory record live here; the file append is the
// caller's (profiles.ts / index.ts), so this stays testable without Electron.

import type { SocketCommandRecord } from './socket'

/** One socket request, stamped. */
export interface CommandLogEntry extends SocketCommandRecord {
  /** When the reply went out (ms since epoch). */
  at: number
}

/** Errors are cut so one huge stack does not swamp the log. */
const ERROR_MAX = 300

/** One log line: ISO time | OK/FAIL | client | command [| error]. A missing
 * client or command is written as `-`, so a rejected request still shows up. */
export function formatCommandEntry(e: CommandLogEntry): string {
  const parts = [
    new Date(e.at).toISOString(),
    e.ok ? 'OK' : 'FAIL',
    e.client ?? '-',
    e.command ?? '-'
  ]
  if (!e.ok && e.error) parts.push(e.error.replace(/\s+/g, ' ').slice(0, ERROR_MAX))
  return parts.join(' | ')
}

/** The last socket request, for whoever needs to attribute an event to it. */
export class LastCommand {
  private last: CommandLogEntry | null = null

  record(entry: CommandLogEntry): void {
    this.last = entry
  }

  /** `lastCommand=<cmd> client=<client> ago=<ms>ms`, or `lastCommand=none`.
   * `now` is injectable for tests. */
  describe(now: number = Date.now()): string {
    const l = this.last
    if (!l) return 'lastCommand=none'
    return `lastCommand=${l.command ?? '-'} client=${JSON.stringify(l.client ?? '-')} ago=${now - l.at}ms`
  }
}

/** The process-wide record: the socket writes it, the activation trace reads it. */
export const lastCommand = new LastCommand()
