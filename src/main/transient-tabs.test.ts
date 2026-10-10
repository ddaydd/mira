import { describe, it, expect } from 'vitest'
import { transientTabIds } from './transient-tabs'
import { downloadPageUrl } from './download-doc'

const page = downloadPageUrl({
  id: 'd1',
  state: 'completed',
  filename: 'x.zip',
  url: 'https://e.org/x.zip',
  savePath: '/home/me/Downloads/x.zip',
  bytes: 10
})

describe('transientTabIds', () => {
  it('drops the Settings tab and the tabs showing the download page', () => {
    const ids = transientTabIds('settings', [
      ['a', 'https://e.org/'],
      ['b', page],
      ['c', 'https://e.org/x.zip']
    ])
    expect([...ids].sort()).toEqual(['b', 'settings'])
  })

  it('keeps everything when nothing is transient', () => {
    expect(transientTabIds(null, [['a', 'https://e.org/']]).size).toBe(0)
  })
})
