// What happens while Mira quits, made visible.
//
// 2026-09-27: Cmd+Q felt far too long, with nothing on screen to say Mira was
// busy, and nothing in the log to say which step took the time. Two halves:
//   - QuitTimeline: one `[mira-quit] +<ms>ms <step>` log line per step, relative
//     to the moment the quit was confirmed, so a slow quit names its slow step.
//   - the progress window's document: "Quitting Mira…" with a spinner and the
//     current step, shown while the quit is deferred to re-lock encrypted
//     profiles (hdiutil, seconds per profile — index.ts before-quit).
//
// Pure: the timing lines and the HTML/JS. The native window lives in
// quit-progress-window.ts.

/** Logs quit steps relative to the start of the quit. */
export class QuitTimeline {
  private start: number | null = null

  constructor(
    private readonly now: () => number,
    private readonly log: (line: string) => void
  ) {}

  /** Start the clock at a new quit attempt (its +0ms line). A quit can be
   * cancelled (a page's beforeunload) and asked again much later: each attempt
   * is timed from its own start. */
  begin(step: string): void {
    this.start = null
    this.mark(step)
  }

  /** Record a step. The first call starts the clock (it is the +0ms line). */
  mark(step: string): void {
    const t = this.now()
    if (this.start === null) this.start = t
    this.log(formatQuitStep(t - this.start, step))
  }
}

export function formatQuitStep(elapsedMs: number, step: string): string {
  return `[mira-quit] +${Math.max(0, Math.round(elapsedMs))}ms ${step}`
}

/** The step shown under "Quitting Mira…" while a vault is re-locked. */
export function lockingStepLabel(profileLabel: string | undefined): string {
  const name = profileLabel?.trim()
  return name ? `Locking encrypted profile “${name}”` : 'Locking encrypted profile'
}

/** Script that replaces the step line of the progress window. The label goes
 * through JSON.stringify, never spliced raw: a profile label is user text. */
export function setStepScript(label: string): string {
  return `document.getElementById('step').textContent = ${JSON.stringify(label)}`
}

export const QUIT_PROGRESS_SIZE = { width: 340, height: 112 }

/** Dark-only, like the rest of Mira's chrome (toast-doc.ts tokens). */
export const QUIT_PROGRESS_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; background: #1b1b1f; color: #ebebeb;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, sans-serif; cursor: default;
    user-select: none; -webkit-app-region: drag; }
  body { display: flex; align-items: center; gap: 16px; padding: 0 22px; box-sizing: border-box; }
  .spin { flex: none; width: 26px; height: 26px; border-radius: 50%;
    border: 3px solid #3a3a40; border-top-color: #4d7cfe; animation: r 0.9s linear infinite; }
  @keyframes r { to { transform: rotate(360deg); } }
  h1 { font-size: 14px; font-weight: 600; margin: 0 0 3px; }
  #step { color: #a0a0a8; margin: 0; }
</style></head>
<body>
  <div class="spin"></div>
  <div><h1>Quitting Mira…</h1><p id="step">Saving your session</p></div>
</body>
</html>`

export const QUIT_PROGRESS_URL = `data:text/html;charset=utf-8,${encodeURIComponent(QUIT_PROGRESS_HTML)}`
