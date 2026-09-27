// What "Check for Updates…" shows when the user asked for it from the menu.
//
// The daily check announces itself with a desktop notification: it fires on its
// own, while the user may be in another app, and Mira must never jump in front of
// them (foreground-policy.ts). A check the user just clicked is the opposite case:
// they are in Mira, waiting for an answer, and a silent notification read as
// "nothing happened" (2026-09-27). So a manual check answers in a dialog attached
// to the window it came from.
//
// Pure: the text, the buttons and what each button does. The native dialog and
// the actions live in update-service.ts.

import { formatVersion, releasePage, type Outcome } from './update-check'
import type { Distribution } from './self-update'
import type { CommandOrigin } from './foreground-policy'

/** Whether a check's answer comes back in a dialog. Only for a click inside Mira
 * (origin 'ui'): a socket/MCP caller must never raise a modal in front of the user
 * (foreground-policy.ts), and nobody is there to dismiss it. */
export function answersInDialog(origin: CommandOrigin): boolean {
  return origin === 'ui'
}

/** What a dialog button does once clicked. */
export type UpdateDialogAction =
  { kind: 'install' } | { kind: 'open'; url: string } | { kind: 'none' }

export interface UpdateDialog {
  type: 'info' | 'warning'
  message: string
  detail: string
  /** Button labels, left to right as macOS lays them out (first = default). */
  buttons: string[]
  /** One action per button, same order. */
  actions: UpdateDialogAction[]
  /** The button Escape picks. */
  cancelId: number
}

export function updateDialogFor(
  outcome: Outcome,
  current: string,
  distribution: Distribution
): UpdateDialog {
  switch (outcome.kind) {
    case 'newer': {
      const version = formatVersion(outcome.version)
      const url = releasePage(outcome.version)
      if (distribution === 'release') {
        return {
          type: 'info',
          message: `Mira ${version} is available`,
          detail: `You are running Mira ${current}. It downloads in the background and installs when you quit Mira.`,
          buttons: ['Download and Install', 'Release Notes', 'Later'],
          actions: [{ kind: 'install' }, { kind: 'open', url }, { kind: 'none' }],
          cancelId: 2
        }
      }
      return {
        type: 'info',
        message: `Mira ${version} is available`,
        detail:
          `You are running Mira ${current}, a local build: it never replaces itself with a ` +
          'downloaded release. Rebuild it from the repository to get the new version.',
        buttons: ['Release Notes', 'OK'],
        actions: [{ kind: 'open', url }, { kind: 'none' }],
        cancelId: 1
      }
    }
    case 'up-to-date':
      return {
        type: 'info',
        message: 'Mira is up to date',
        detail: `Mira ${current} is the latest release.`,
        buttons: ['OK'],
        actions: [{ kind: 'none' }],
        cancelId: 0
      }
    case 'failed':
      return {
        type: 'warning',
        message: 'Could not check for updates',
        detail: outcome.error,
        buttons: ['OK'],
        actions: [{ kind: 'none' }],
        cancelId: 0
      }
  }
}
