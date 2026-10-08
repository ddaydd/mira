// Electron wiring for the runtime (Electron / Chromium) update check — Linux,
// where Mira releases do not apply (see runtime-update.ts). Same shape as
// update-service.ts: the shared UpdateChecker decides when to check and tells
// each version once; this file fetches, persists and shows the notification.

import { Notification, app, shell } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { UpdateChecker, type Outcome, type UpdateState } from './update-check'
import { electronTrackUrl, runtimeNoticeFor } from './runtime-update'

function statePath(): string {
  return join(app.getPath('userData'), 'runtime-update-check.json')
}

function loadState(): UpdateState {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), 'utf8')) as Partial<UpdateState>
    return {
      lastCheck: typeof parsed.lastCheck === 'number' ? parsed.lastCheck : 0,
      notifiedVersion: typeof parsed.notifiedVersion === 'string' ? parsed.notifiedVersion : null
    }
  } catch {
    return { lastCheck: 0, notifiedVersion: null }
  }
}

function saveState(state: UpdateState): void {
  try {
    mkdirSync(dirname(statePath()), { recursive: true })
    writeFileSync(statePath(), `${JSON.stringify(state, null, 2)}\n`)
  } catch (error) {
    console.error('[mira] runtime update check: cannot write state:', error)
  }
}

/** The latest release of the running Electron major, from npm. */
async function fetchLatestElectron(): Promise<string> {
  const response = await fetch(electronTrackUrl(process.versions.electron), {
    headers: { Accept: 'application/json', 'User-Agent': `Mira/${app.getVersion()}` },
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error(`npm answered ${response.status}`)
  const body = (await response.json()) as { version?: unknown }
  if (typeof body.version !== 'string') throw new Error('unexpected response: no version')
  return body.version
}

function show(outcome: Outcome): void {
  const notice = runtimeNoticeFor(outcome, {
    electron: process.versions.electron,
    chrome: process.versions.chrome
  })
  if (!Notification.isSupported()) {
    console.log(`[mira] ${notice.title} — ${notice.body}`)
    return
  }
  const notification = new Notification({ title: notice.title, body: notice.body })
  if (notice.open) {
    const page = notice.open
    notification.on('click', () => {
      shell.openExternal(page).catch((error) => console.error('[mira] open release notes', error))
    })
  }
  notification.show()
}

/** The runtime checker: a daily, once-per-version notification, plus checkNow
 * for the menu's "Check for Updates…" on Linux. */
export function createRuntimeUpdateChecker(): UpdateChecker {
  return new UpdateChecker({
    currentVersion: process.versions.electron,
    fetchLatestTag: fetchLatestElectron,
    now: () => Math.floor(Date.now() / 1000),
    loadState,
    saveState,
    notify: show
  })
}
