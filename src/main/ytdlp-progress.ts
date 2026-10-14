// Linux fork: a yt-dlp video download that reports what it is doing, so it can
// live in Settings → Downloads like any file (title, live progress, the reason
// it failed) instead of only an elapsed clock in the status bar.
//
// yt-dlp's `--print` implies `--quiet`, which also silences the progress lines
// ytdlp.ts parses — `--progress` brings them back (on stdout). The title, the
// destination and the expected size are printed up front with a `MIRA-` marker.
// A merged download comes in several parts (video, then audio), each with its own
// "x% of SIZE" pass: the parts are summed against the size announced for the
// whole. The line parsing is pure and tested in ytdlp-progress.test.ts.

import { spawn } from 'child_process'
import { augmentedPath, ytdlpArgs } from './ytdlp'

export interface YtdlpProgress {
  /** Video title, '' until yt-dlp printed it. */
  title: string
  /** Destination path announced before the download, '' until known. */
  file: string
  /** Final path printed after the move (only on success). */
  finalPath: string
  /** Size announced for the whole download (all parts), 0 when unknown. */
  expectedBytes: number
  /** Bytes of the parts already finished. */
  doneBytes: number
  /** Size of the part being downloaded. */
  partBytes: number
  /** Percent of the current part. */
  partPct: number
  /** Last `ERROR:` line, without the prefix. */
  error: string
}

export function initialProgress(): YtdlpProgress {
  return {
    title: '',
    file: '',
    finalPath: '',
    expectedBytes: 0,
    doneBytes: 0,
    partBytes: 0,
    partPct: 0,
    error: ''
  }
}

const UNITS: Record<string, number> = {
  B: 1,
  KIB: 1024,
  MIB: 1024 ** 2,
  GIB: 1024 ** 3,
  TIB: 1024 ** 4,
  KB: 1000,
  MB: 1000 ** 2,
  GB: 1000 ** 3,
  TB: 1000 ** 4
}

/** Bytes behind a yt-dlp size like "218.53KiB" / "~ 1.16GiB", 0 when unparsable. Pure. */
export function parseSize(text: string): number {
  const m = /([\d.]+)\s*([KMGT]?i?B)/i.exec(text)
  if (!m) return 0
  const unit = UNITS[m[2].toUpperCase()]
  const n = Number(m[1])
  return unit && Number.isFinite(n) ? Math.round(n * unit) : 0
}

/** The extra flags on top of ytdlpArgs: progress back on, and what we need to
 * know before the download starts. Pure. */
export function ytdlpTrackedArgs(url: string, outputDir: string): string[] {
  const base = ytdlpArgs(url, outputDir)
  return [
    ...base.slice(0, -1),
    '--progress',
    '--print',
    'before_dl:MIRA-TITLE %(title)s',
    '--print',
    'before_dl:MIRA-FILE %(filename)s',
    '--print',
    'before_dl:MIRA-SIZE %(filesize,filesize_approx)s',
    url
  ]
}

/** Fold one output line (stdout or stderr) into the state. Pure. */
export function feedLine(p: YtdlpProgress, raw: string): YtdlpProgress {
  const line = raw.trim()
  if (!line) return p
  if (line.startsWith('MIRA-TITLE ')) return { ...p, title: line.slice(11).trim() }
  if (line.startsWith('MIRA-FILE ')) return { ...p, file: line.slice(10).trim() }
  if (line.startsWith('MIRA-SIZE ')) {
    const n = Number(line.slice(10).trim())
    return Number.isFinite(n) && n > 0 ? { ...p, expectedBytes: n } : p
  }
  if (line.startsWith('ERROR:')) return { ...p, error: line.slice(6).trim() }
  const prog = /^\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*(\S+)/.exec(line)
  if (prog) {
    const size = parseSize(prog[2])
    const pct = Math.min(100, Number(prog[1]))
    // A new size = the next part (audio after video): bank the finished one.
    if (size > 0 && p.partBytes > 0 && size !== p.partBytes) {
      return { ...p, doneBytes: p.doneBytes + p.partBytes, partBytes: size, partPct: pct }
    }
    return { ...p, partBytes: size || p.partBytes, partPct: pct }
  }
  if (line.startsWith('[') || line.startsWith('WARNING:')) return p
  // `--print after_move:filepath`: a bare line, printed once the file is in place.
  return { ...p, finalPath: line }
}

/** Received / total bytes for the downloads tracker. Pure. */
export function progressBytes(p: YtdlpProgress): { received: number; total: number } {
  const received = Math.round(p.doneBytes + (p.partBytes * p.partPct) / 100)
  const total = Math.max(p.expectedBytes, p.doneBytes + p.partBytes)
  return { received: Math.min(received, total), total }
}

/** The pieces a stopped download left next to `file` (its announced
 * destination), among the names in its folder: `<stem>.f401.mp4.part`, a finished
 * `<stem>.f251.webm` part waiting to be merged, `<stem>.webm.part`, `.ytdl`
 * state. Nothing else of the folder can match. Pure. */
export function leftoverParts(file: string, names: string[]): string[] {
  const base = file.split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  if (!stem) return []
  return names.filter((name) => {
    if (!name.startsWith(`${stem}.`)) return false
    const rest = name.slice(stem.length)
    return rest.endsWith('.part') || rest.endsWith('.ytdl') || /^\.f[\w-]+\.\w+$/.test(rest)
  })
}

export interface YtdlpTrackedResult {
  saved: boolean
  cancelled: boolean
  /** Absolute path of the saved file, on success. */
  file?: string
  error?: string
  /** The announced destination, even on failure (to clean its parts up). */
  plannedFile?: string
}

/** Run yt-dlp on `url` into `outputDir`, calling `onChange` as the state moves.
 * Aborting `signal` kills yt-dlp (result `cancelled`). Never rejects. */
export function runYtdlpTracked(
  url: string,
  outputDir: string,
  env: NodeJS.ProcessEnv,
  onChange: (p: YtdlpProgress) => void,
  signal?: AbortSignal
): Promise<YtdlpTrackedResult> {
  return new Promise((resolve) => {
    let state = initialProgress()
    let settled = false
    const done = (r: YtdlpTrackedResult): void => {
      if (settled) return
      settled = true
      resolve(r)
    }
    const child = spawn('yt-dlp', ytdlpTrackedArgs(url, outputDir), {
      env: { ...env, PATH: augmentedPath(env.PATH, env.HOME) },
      signal
    })
    const reader = (): ((d: Buffer) => void) => {
      let rest = ''
      return (d) => {
        const lines = (rest + String(d)).split('\n')
        rest = lines.pop() ?? ''
        const before = state
        for (const line of lines) state = feedLine(state, line)
        if (state !== before) onChange(state)
      }
    }
    child.stdout.on('data', reader())
    child.stderr.on('data', reader())
    child.on('error', (e: Error & { code?: string }) => {
      if (signal?.aborted) return done({ saved: false, cancelled: true, plannedFile: state.file })
      done({
        saved: false,
        cancelled: false,
        error:
          e.code === 'ENOENT'
            ? 'yt-dlp is not installed (sudo apt install yt-dlp / pip install yt-dlp)'
            : `yt-dlp failed to start: ${e.message}`
      })
    })
    child.on('close', (code) => {
      if (signal?.aborted) return done({ saved: false, cancelled: true, plannedFile: state.file })
      if (code === 0) {
        return done({ saved: true, cancelled: false, file: state.finalPath || state.file })
      }
      done({
        saved: false,
        cancelled: false,
        error: state.error || `yt-dlp exited with code ${code}`,
        plannedFile: state.file
      })
    })
  })
}
