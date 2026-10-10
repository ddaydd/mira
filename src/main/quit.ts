// Quit confirmation: the decision half, with no Electron in it (see "tout
// testable" in CLAUDE.md). The native half — the actual message box and
// app.quit() — is wired in index.ts, which installs the gate created here.
//
// Why a gate at all: Cmd+Q sits one key away from Cmd+W (close tab) and Mira
// answers it instantly, taking every window and tab down with no way back but a
// relaunch. So a user-driven quit asks first, ALWAYS — the count of open tabs or
// windows is deliberately not part of the decision.
//
// Closing the LAST window (Cmd+Shift+W, or the red button) quits Mira too, so it
// asks the same question — profiles.ts holds the window's 'close' back and lets
// this gate re-quit on a Yes, which keeps the window untouched on a No.
//
// The quit paths that must NOT ask, because no human is there to answer: the
// `quit` socket command (a modal would hang the app with the client already told
// "ok"), an OS signal (Ctrl-C in the dev terminal), and the boot that only exists
// to hand its urls to a running Mira. They call suppressQuitPrompt() right before
// app.quit().

/** Texts of the confirmation dialog. Here rather than in index.ts so a test can
 * assert them without pulling Electron in. */
export const QUIT_CONFIRM = {
  message: 'Quit Mira?',
  detail: 'All windows and tabs close. They reopen at the next launch.',
  quitLabel: 'Quit',
  cancelLabel: 'Cancel',
  dontAskLabel: "Don't ask again"
} as const

/** Shows the confirmation and resolves true when the user picked Quit. Must
 * never reject — a broken prompt resolving false just means "do not quit". */
export type QuitPrompt = () => Promise<boolean>

export interface QuitGate {
  /** Called from the app's 'before-quit'. Returns true to let the quit proceed;
   * false means the caller must preventDefault() — a prompt is now up, and the
   * gate re-quits by itself if the user confirms. */
  allowQuit: () => boolean
  /** Mark the quit that is about to be requested as already decided, so the next
   * allowQuit() lets it through without asking. */
  suppress: () => void
  /** True when the quit under way is one a person confirmed in the dialog, false
   * for a scripted one (suppress()): only the former may put a window up. */
  confirmedByUser: () => boolean
}

export function createQuitGate(opts: { prompt: QuitPrompt; quit: () => void }): QuitGate {
  // Sticky once true: from that point the quit is under way and every further
  // 'before-quit' pass (the vault re-lock defers and re-quits, see index.ts)
  // must go straight through.
  let confirmed = false
  // Guards against a second Cmd+Q while the dialog is already up, which would
  // stack a second identical modal.
  let prompting = false
  let byUser = false
  return {
    allowQuit: () => {
      if (confirmed) return true
      if (!prompting) {
        prompting = true
        void opts.prompt().then(
          (ok) => {
            prompting = false
            if (!ok) return
            confirmed = true
            byUser = true
            opts.quit()
          },
          () => {
            prompting = false
          }
        )
      }
      return false
    },
    suppress: () => {
      confirmed = true
      byUser = false
    },
    confirmedByUser: () => byUser
  }
}

// The gate is a module singleton because the quit paths live in three files:
// index.ts owns the dialog and creates it, profiles.ts needs to suppress the
// prompt for its two programmatic quits, and neither can import the other.
let installed: QuitGate | null = null

export function installQuitGate(gate: QuitGate): void {
  installed = gate
}

/** 'before-quit': may this quit go through? True when no gate is installed yet
 * (early boot, e.g. the single-instance handoff quits before whenReady wires
 * anything) — nothing to confirm and no window to ask in. */
export function allowQuitNow(): boolean {
  return installed ? installed.allowQuit() : true
}

/** Call right before app.quit() on a quit that must not ask (scripted quit,
 * last window closed, OS signal). */
export function suppressQuitPrompt(): void {
  installed?.suppress()
}

/** Whether the quit under way was confirmed by a person (QuitGate). */
export function quitConfirmedByUser(): boolean {
  return installed?.confirmedByUser() ?? false
}

/** What 'before-quit' does about the encrypted profiles still unlocked (index.ts).
 * - 'wait': their quit-time lock is still running. The quit is held back: letting
 *   a second Cmd+Q (or a socket quit, SIGTERM) through would exit mid-copy, and
 *   the next launch would discard the unsaved session.
 * - 'lock': some vault needs locking first, so defer the quit and lock.
 * - 'proceed': nothing left to lock. A vault whose lock already failed during
 *   this run counts as done, or the quit would retry it forever; a vault
 *   unlocked again after a quit was cancelled does not, and is locked again. */
export function quitVaultStep(opts: {
  lockRunning: boolean
  unlocked: readonly string[]
  failed: ReadonlySet<string>
}): 'wait' | 'lock' | 'proceed' {
  if (opts.lockRunning) return 'wait'
  return opts.unlocked.some((id) => !opts.failed.has(id)) ? 'lock' : 'proceed'
}

/** Tests only: drop the installed gate so cases do not leak into each other. */
export function resetQuitGate(): void {
  installed = null
}
