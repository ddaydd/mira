import { describe, expect, it } from 'vitest'
import { iconCandidates, imageDataUrl, MenuFavicons, rasterizeScript } from './menu-favicons'

describe('iconCandidates', () => {
  it('tries the declared icon, then the site /favicon.ico', () => {
    expect(iconCandidates('https://a.example/x?y', 'https://cdn/i.svg')).toEqual([
      'https://cdn/i.svg',
      'https://a.example/favicon.ico'
    ])
    expect(iconCandidates('https://a.example/', null)).toEqual(['https://a.example/favicon.ico'])
  })
  it('has nothing for a non-web url', () => {
    expect(iconCandidates('file:///tmp/x', null)).toEqual([])
    expect(iconCandidates('not a url', null)).toEqual([])
  })
})

describe('imageDataUrl', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ico = Buffer.from([0, 0, 1, 0, 1, 0, 16, 16])

  it('sniffs the real type whatever the server says', () => {
    expect(imageDataUrl(png, 'application/octet-stream')).toMatch(/^data:image\/png;base64,/)
    expect(imageDataUrl(ico, 'text/plain')).toMatch(/^data:image\/x-icon;base64,/)
    expect(imageDataUrl(Buffer.from('<svg xmlns="x"/>'), '')).toMatch(/^data:image\/svg\+xml;/)
  })
  it('trusts an image content type it cannot sniff, refuses an HTML page', () => {
    expect(imageDataUrl(Buffer.from('BM...'), 'image/bmp')).toMatch(/^data:image\/bmp;/)
    expect(imageDataUrl(Buffer.from('<!doctype html>'), 'text/html')).toBeNull()
    expect(imageDataUrl(Buffer.alloc(0), 'image/png')).toBeNull()
  })
})

describe('rasterizeScript', () => {
  it('embeds the data url as a JS string literal', () => {
    expect(rasterizeScript('data:image/png;base64,"x"')).toContain(
      '"data:image/png;base64,\\"x\\""'
    )
  })
})

describe('MenuFavicons', () => {
  const make = (
    icons: Record<string, string>
  ): { cache: MenuFavicons<string, string>; fetched: string[] } => {
    const fetched: string[] = []
    const cache = new MenuFavicons<string, string>({
      lookup: (page) => (page.includes('declared') ? 'https://cdn/declared.ico' : null),
      fetchIcon: async (url) => {
        fetched.push(url)
        return icons[url] ? { bytes: Buffer.from(icons[url]), type: 'image/png' } : null
      },
      rasterize: async (dataUrl, via) => `png(${via}):${dataUrl.slice(0, 22)}`,
      toImage: (png) => `img:${png}`
    })
    return { cache, fetched }
  }

  it('falls back to /favicon.ico and remembers hits and misses', async () => {
    const { cache, fetched } = make({ 'https://b.example/favicon.ico': 'x' })
    await cache.load(
      ['https://declared.example/', 'https://b.example/p', 'https://none/'],
      1000,
      'w'
    )
    expect(cache.get('https://b.example/p')).toBe('img:png(w):data:image/png;base64,')
    expect(cache.get('https://declared.example/')).toBeUndefined()
    expect(fetched).toContain('https://cdn/declared.ico')
    expect(fetched).toContain('https://declared.example/favicon.ico')
    const before = fetched.length
    await cache.load(['https://b.example/p', 'https://none/'], 1000, 'w')
    expect(fetched.length).toBe(before)
  })

  it('stops waiting after waitMs, and the icon lands later', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const cache = new MenuFavicons<string, null>({
      lookup: () => null,
      fetchIcon: async () => (await gate, { bytes: Buffer.from('x'), type: 'image/png' }),
      rasterize: async () => 'png',
      toImage: () => 'img'
    })
    await cache.load(['https://slow.example/'], 10, null)
    expect(cache.get('https://slow.example/')).toBeUndefined()
    release()
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(cache.get('https://slow.example/')).toBe('img')
  })
})
