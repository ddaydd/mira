import { describe, it, expect } from 'vitest'
import {
  feedLine,
  initialProgress,
  leftoverParts,
  parseSize,
  progressBytes,
  ytdlpTrackedArgs,
  type YtdlpProgress
} from './ytdlp-progress'

const feed = (lines: string[]): YtdlpProgress => lines.reduce(feedLine, initialProgress())

describe('parseSize', () => {
  it('reads binary and decimal units, with or without the ~ estimate', () => {
    expect(parseSize('218.53KiB')).toBe(Math.round(218.53 * 1024))
    expect(parseSize('~ 1.16GiB')).toBe(Math.round(1.16 * 1024 ** 3))
    expect(parseSize('12MB')).toBe(12_000_000)
    expect(parseSize('Unknown')).toBe(0)
  })
})

describe('ytdlpTrackedArgs', () => {
  it('keeps the url last and turns progress back on', () => {
    const args = ytdlpTrackedArgs('https://youtu.be/x', '/dl')
    expect(args[args.length - 1]).toBe('https://youtu.be/x')
    expect(args).toContain('--progress')
    expect(args).toContain('before_dl:MIRA-TITLE %(title)s')
    expect(args.filter((a) => a === 'https://youtu.be/x')).toHaveLength(1)
  })
})

describe('feedLine', () => {
  it('collects the title, destination and announced size', () => {
    const p = feed([
      'MIRA-TITLE Me at the zoo',
      'MIRA-FILE /dl/Me_at_the_zoo.webm',
      'MIRA-SIZE 475961'
    ])
    expect(p).toMatchObject({
      title: 'Me at the zoo',
      file: '/dl/Me_at_the_zoo.webm',
      expectedBytes: 475961
    })
    expect(feed(['MIRA-SIZE NA']).expectedBytes).toBe(0)
  })

  it('sums the parts of a merged download (video, then audio)', () => {
    const p = feed([
      'MIRA-SIZE 2000',
      '[download]  50.0% of  1000B at 1MiB/s ETA 00:00',
      '[download] 100% of  1000B in 00:00:00 at 1MiB/s',
      '[download]  50.0% of  1000B at 1MiB/s ETA 00:00'
    ])
    // Same-size parts are not told apart: the second pass reads as the first.
    expect(progressBytes(p)).toEqual({ received: 500, total: 2000 })
    const q = feed([
      'MIRA-SIZE 3000',
      '[download] 100.0% of  2000B at 1MiB/s ETA 00:00',
      '[download]  50.0% of  1000B at 1MiB/s ETA 00:00'
    ])
    expect(progressBytes(q)).toEqual({ received: 2500, total: 3000 })
  })

  it('falls back to the parts seen so far when no size was announced', () => {
    const p = feed(['[download]  25.0% of  4.00KiB at Unknown B/s ETA Unknown'])
    expect(progressBytes(p)).toEqual({ received: 1024, total: 4096 })
  })

  it('keeps the last error and the final path, ignores the rest', () => {
    const p = feed([
      'WARNING: [youtube] No supported JavaScript runtime could be found.',
      '[youtube] Extracting URL',
      'ERROR: unable to download video data: HTTP Error 403: Forbidden'
    ])
    expect(p.error).toBe('unable to download video data: HTTP Error 403: Forbidden')
    expect(p.finalPath).toBe('')
    expect(feed(['/dl/clip.webm']).finalPath).toBe('/dl/clip.webm')
  })
})

describe('leftoverParts', () => {
  it('picks only the pieces of that one video', () => {
    const names = [
      'Clip.f401.mp4.part',
      'Clip.f251.webm',
      'Clip.webm.part',
      'Clip.webm.ytdl',
      'Clip.webm',
      'Clip 2.f401.mp4.part',
      'Clip_other.f401.mp4.part',
      'notes.txt'
    ]
    expect(leftoverParts('/dl/Clip.webm', names)).toEqual([
      'Clip.f401.mp4.part',
      'Clip.f251.webm',
      'Clip.webm.part',
      'Clip.webm.ytdl'
    ])
    expect(leftoverParts('', names)).toEqual([])
  })
})
