// Runtime (Electron / Chromium) update check, for builds that do not get Mira
// releases — the Linux fork packages its own .deb, so the useful question there
// is not "is there a new Mira?" but "is my embedded Chromium behind on security
// fixes?". Chromium ships with Electron, and each Electron major publishes patch
// releases carrying Chromium's security backports, tracked by the npm dist-tag
// `<major>-x-y`. This file is the pure part (url, notice text); the schedule
// and dedup are the shared UpdateChecker (update-check.ts).

import { formatVersion, type Outcome } from './update-check'

/** The npm registry document for the latest release of the running Electron
 * major (a ~2 KB JSON whose `version` is e.g. "44.7.0"). Staying on the major
 * keeps the update a drop-in patch, never an API break. */
export function electronTrackUrl(electronVersion: string): string {
  const major = electronVersion.trim().replace(/^v/, '').split('.')[0]
  if (!/^\d+$/.test(major)) throw new Error(`unparsable Electron version: ${electronVersion}`)
  return `https://registry.npmjs.org/electron/${major}-x-y`
}

/** The notification text for a runtime-check outcome, and the page a click
 * opens (Electron's release notes, which list the Chromium bump). */
export function runtimeNoticeFor(
  outcome: Outcome,
  current: { electron: string; chrome: string }
): { title: string; body: string; open?: string } {
  switch (outcome.kind) {
    case 'newer': {
      const version = formatVersion(outcome.version)
      return {
        title: 'Chromium update available',
        body:
          `Electron ${version} is out (Mira runs ${current.electron}, Chromium ` +
          `${current.chrome}). Rebuild the .deb to get its security fixes.`,
        open: `https://releases.electronjs.org/release/v${version}`
      }
    }
    case 'up-to-date':
      return {
        title: 'Chromium is up to date',
        body: `Electron ${current.electron} (Chromium ${current.chrome}) is the latest of its line.`
      }
    case 'failed':
      return { title: 'Could not check for a Chromium update', body: outcome.error }
  }
}
