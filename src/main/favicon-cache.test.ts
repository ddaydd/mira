import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  FaviconCache,
  type FetchPage,
  iconKeys,
  lookupIcon,
  normalizeFaviconMap,
  parseIconLink,
  rememberIcon
} from './favicon-cache'

const PIN = 'https://maps.gstatic.com/pin.png'
const G = 'https://www.google.fr/favicon.ico'

describe('iconKeys', () => {
  it('goes from the exact url to the origin, hash dropped', () => {
    expect(iconKeys('https://www.google.fr/maps/@47,-9z?x=1#h')).toEqual([
      'https://www.google.fr/maps/@47,-9z?x=1',
      'https://www.google.fr/maps',
      'https://www.google.fr'
    ])
    expect(iconKeys('https://a.example/')).toEqual(['https://a.example/', 'https://a.example'])
  })

  it('has no key for a non-web url', () => {
    expect(iconKeys('file:///tmp/x')).toEqual([])
    expect(iconKeys('nope')).toEqual([])
  })
})

describe('rememberIcon / lookupIcon', () => {
  it('serves another page of the same section, and the site root its own icon', () => {
    let map = rememberIcon({}, 'https://www.google.fr/', G)
    map = rememberIcon(map, 'https://www.google.fr/maps/@1,2z', PIN)
    expect(lookupIcon(map, 'https://www.google.fr/maps/@43,0z')).toBe(PIN)
    expect(lookupIcon(map, 'https://www.google.fr/search?q=x')).toBe(G)
  })

  it('lets a deep page seed the origin only when it has none', () => {
    const map = rememberIcon({}, 'https://h.example/dashboard', 'https://h.example/i.png')
    expect(lookupIcon(map, 'https://h.example/other')).toBe('https://h.example/i.png')
    const again = rememberIcon(map, 'https://h.example/deep/page', 'https://h.example/j.png')
    expect(lookupIcon(again, 'https://h.example/other')).toBe('https://h.example/i.png')
  })

  it('ignores junk icons and returns the same map when nothing changes', () => {
    const map = rememberIcon({}, 'https://a.example/', 'https://a.example/f.ico')
    expect(rememberIcon(map, 'https://a.example/', 'https://a.example/f.ico')).toBe(map)
    expect(rememberIcon(map, 'https://a.example/', 'javascript:x')).toBe(map)
  })
})

describe('parseIconLink', () => {
  const base = 'https://h.example/app/page'
  it('takes the first icon link, resolved against the page', () => {
    const html = `<link rel="stylesheet" href="s.css"><link rel='shortcut icon' href=/img/fav.png?a=1&amp;b=2><link rel="icon" href="x.ico">`
    expect(parseIconLink(html, base)).toBe('https://h.example/img/fav.png?a=1&b=2')
  })

  it('prefers the real icon over an "alternate icon"', () => {
    const html = '<link rel="alternate icon" href="/f.png"><link rel="icon" href="/f.svg">'
    expect(parseIconLink(html, base)).toBe('https://h.example/f.svg')
    expect(parseIconLink('<link rel="alternate icon" href="/f.png">', base)).toBe(
      'https://h.example/f.png'
    )
  })

  it('skips mask-icon, falls back to apple-touch-icon, else null', () => {
    expect(
      parseIconLink(
        '<link rel="mask-icon" href="m.svg"><link rel="apple-touch-icon" href="t.png">',
        base
      )
    ).toBe('https://h.example/app/t.png')
    expect(parseIconLink('<p>no icon</p>', base)).toBeNull()
  })
})

describe('FaviconCache', () => {
  const file = (): string => join(mkdtempSync(join(tmpdir(), 'mira-fav-')), 'favicons.json')

  it('fetches an unknown page once, keeps what tabs noted', async () => {
    const cache = new FaviconCache(file())
    cache.note('https://seen.example/', 'https://seen.example/s.png')
    const fetched: string[] = []
    const fetchPage: FetchPage = async (url) => {
      fetched.push(url)
      return url.includes('broken') ? null : { url, html: '<link rel="icon" href="/n.svg">' }
    }
    const urls = ['https://seen.example/x', 'https://new.example/a', 'https://broken.example/']
    expect(await cache.resolve(urls, fetchPage)).toEqual({
      'https://seen.example/x': 'https://seen.example/s.png',
      'https://new.example/a': 'https://new.example/n.svg',
      'https://broken.example/': null
    })
    await cache.resolve(urls, fetchPage)
    expect(fetched).toEqual(['https://new.example/a', 'https://broken.example/'])
  })

  it('makes a concurrent caller wait for the same fetch, and drops cross-site redirects', async () => {
    const cache = new FaviconCache(file())
    let calls = 0
    const fetchPage: FetchPage = async (url) => {
      calls++
      await new Promise((r) => setTimeout(r, 20))
      if (url.includes('login'))
        return { url: 'https://accounts.example/', html: '<link rel="icon" href="/a.png">' }
      return { url, html: '<link rel="icon" href="/n.png">' }
    }
    const [a, b] = await Promise.all([
      cache.resolve(['https://slow.example/', 'https://login.example/'], fetchPage),
      cache.resolve(['https://slow.example/'], fetchPage)
    ])
    expect(a).toEqual({
      'https://slow.example/': 'https://slow.example/n.png',
      'https://login.example/': null
    })
    expect(b).toEqual({ 'https://slow.example/': 'https://slow.example/n.png' })
    expect(calls).toBe(2)
  })

  it('lets a visit beat what a fetch read', async () => {
    const cache = new FaviconCache(file())
    const maps = 'https://www.google.fr/maps/@43,0,14z'
    await cache.resolve([maps], async (url) => ({ url, html: `<link rel="icon" href="${G}">` }))
    expect(cache.lookup(maps)).toBe(G)
    cache.note('https://www.google.fr/maps/@1,2,3z', PIN)
    expect(cache.lookup(maps)).toBe(PIN)
  })

  it('normalizes a bad file', () => {
    expect(normalizeFaviconMap({ a: 'https://x/i.png', b: 3, '': 'y' })).toEqual({
      a: 'https://x/i.png'
    })
    expect(normalizeFaviconMap([1])).toEqual({})
  })
})
