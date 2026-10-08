// Single-instance-over-socket for the default-browser handoff.
//
// The problem: macOS only routes `open foo.html` / a double-click / a clicked
// link to the PACKAGED bundle — never to `npm run dev`. So while Mira runs in
// dev, a plain `open` would launch a SECOND Mira (the packaged one) next to it.
//
// The fix: dev and build listen on the SAME control socket (default
// /tmp/mira.sock). Before the freshly-launched build creates any window, it
// probes that socket. If another Mira answers (the dev instance), it forwards
// the queued url(s) via the existing `open-url` command and quits — the page
// opens in the already-running Mira, no second window. If nobody answers, it is
// the primary and boots normally.
//
// This lives here (not in socket.ts) because it is the CLIENT side of the
// socket, only used at boot; socket.ts is the server. Pure request-building is
// split out so it is unit-testable without any I/O.

import { connect } from 'net'
import { isAbsolute, resolve } from 'path'
import { pathToFileURL } from 'url'

/** The links / files a Linux launch was asked to open. Linux has no 'open-url'
 * or 'open-file' event: the desktop runs `mira <url-or-path>` and the target
 * lands in argv. Keeps web/file urls and .html paths (resolved against `cwd`),
 * skips flags, the executable and anything else. */
export function urlsFromArgv(argv: readonly string[], cwd: string): string[] {
  const urls: string[] = []
  for (const arg of argv) {
    if (/^(https?|file):/i.test(arg)) urls.push(arg)
    else if (!arg.startsWith('-') && /\.html?$/i.test(arg)) {
      urls.push(pathToFileURL(isAbsolute(arg) ? arg : resolve(cwd, arg)).href)
    }
  }
  return urls
}

/** The socket line that brings the running Mira to the front. Only sent on a
 * user-initiated handoff (a clicked link, a relaunch): on Linux nothing else
 * raises the window, unlike macOS where the OS activates the app it routes to. */
export function raiseRequest(): string {
  return JSON.stringify({ client: 'mira-second-instance', command: 'focus-app' })
}

/** The socket line that hands one queued url to a running Mira. */
export function forwardRequest(url: string): string {
  // Named like every socket caller (socket.ts): command.log then tells a link
  // opened from another app apart from a script.
  return JSON.stringify({ client: 'mira-second-instance', command: 'open-url', params: { url } })
}

/**
 * Try to hand the queued open url(s) to a Mira already listening on `socketPath`.
 * Resolves `true` when a running instance accepted them (the caller should quit),
 * `false` when none is reachable (the caller is the primary and must boot). Never
 * rejects: a missing/stale socket, a connection error, or a timeout all mean "no
 * primary" → `false`.
 */
export function forwardToRunningInstance(
  socketPath: string,
  urls: string[],
  timeoutMs = 2000,
  raise = false
): Promise<boolean> {
  if (urls.length === 0 && !raise) return Promise.resolve(false)
  const lines = [...urls.map(forwardRequest), ...(raise ? [raiseRequest()] : [])]

  return new Promise((resolve) => {
    const conn = connect(socketPath)
    let settled = false
    const finish = (accepted: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      conn.destroy()
      resolve(accepted)
    }

    // A hung primary (connected but never replies) must not block the boot.
    const timer = setTimeout(() => finish(false), timeoutMs)

    // ECONNREFUSED (stale socket file, nobody listening) / ENOENT (no file) →
    // no primary alive → we are it.
    conn.on('error', () => finish(false))

    conn.on('connect', () => {
      for (const line of lines) conn.write(line + '\n')
    })

    // Wait for one response line per url, then we know they all landed and quit.
    let buffer = ''
    let replies = 0
    conn.on('data', (chunk) => {
      buffer += chunk.toString()
      let idx: number
      while ((idx = buffer.indexOf('\n')) >= 0) {
        buffer = buffer.slice(idx + 1)
        replies += 1
        if (replies >= lines.length) finish(true)
      }
    })
  })
}
