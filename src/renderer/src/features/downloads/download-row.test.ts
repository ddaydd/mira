import { describe, it, expect } from 'vitest'
import {
  downloadPercent,
  downloadStatus,
  formatSize,
  sourceHost,
  type DownloadRow
} from './download-row'

function row(patch: Partial<DownloadRow> = {}): DownloadRow {
  return {
    id: 'a',
    url: 'https://files.example.org/x.zip',
    filename: 'x.zip',
    savePath: '/home/me/Downloads/x.zip',
    state: 'completed',
    receivedBytes: 2048,
    totalBytes: 2048,
    paused: false,
    startedAt: 1,
    updatedAt: 1,
    ...patch
  }
}

describe('formatSize', () => {
  it('formats bytes', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(5 * 1024 * 1024)).toBe('5 MB')
  })
})

describe('sourceHost', () => {
  it('keeps the host, falls back to the raw string', () => {
    expect(sourceHost('https://files.example.org/x.zip')).toBe('files.example.org')
    expect(sourceHost('not a url')).toBe('not a url')
  })
})

describe('downloadStatus', () => {
  it('shows progress while running', () => {
    expect(
      downloadStatus(row({ state: 'progressing', receivedBytes: 512, totalBytes: 1024 }))
    ).toBe('512 B of 1 KB (50%)')
    expect(downloadStatus(row({ state: 'progressing', receivedBytes: 512, totalBytes: 0 }))).toBe(
      '512 B'
    )
    expect(
      downloadStatus(row({ state: 'progressing', paused: true, receivedBytes: 512, totalBytes: 0 }))
    ).toBe('Paused — 512 B')
  })

  it('names the end states', () => {
    expect(downloadStatus(row())).toBe('2 KB')
    expect(downloadStatus(row({ missing: true }))).toBe('Deleted')
    expect(downloadStatus(row({ state: 'cancelled' }))).toBe('Cancelled')
    expect(downloadStatus(row({ state: 'interrupted' }))).toBe('Failed')
  })
})

describe('downloadPercent', () => {
  it('is null unless running with a known size', () => {
    expect(downloadPercent(row())).toBeNull()
    expect(downloadPercent(row({ state: 'progressing', totalBytes: 0 }))).toBeNull()
    expect(downloadPercent(row({ state: 'progressing', receivedBytes: 1, totalBytes: 4 }))).toBe(25)
  })
})
