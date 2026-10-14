// The icon each page declares, remembered for the bookmarks bar (Linux fork).
// Without it the bar asked every site for /favicon.ico, which is wrong whenever
// a page declares its own icon (Google Maps showed Google's "G", not the pin) and
// empty when the site has none (a one-letter badge). Chrome shows the icon the
// page itself declared: so does Mira now.
//
// Two sources: every tab's page-favicon-updated (note), and, for a favorite not
// visited since, one fetch of the page to read its <link rel="icon"> (resolve).
// Looked up by exact url, then origin + first path segment (google.fr/maps vs
// google.fr/search), then origin. What a visit noted always wins over what a
// fetch read (a fetch can land on a consent or login page): fetched icons sit
// under a "fetch:" key and are only the last resort. Saved in
// <userData>/favicons.json.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export type FaviconMap = Record<string, string>

/** Longest icon url kept (a data: favicon can be big; the file stays small). */
const MAX_ICON = 16_000

/** The lookup keys of a page url, most precise first: the url without its hash,
 * origin + first path segment (when there is one), origin. Empty for a non-web
 * url. Pure. */
export function iconKeys(pageUrl: string): string[] {
  let u: URL
  try {
    u = new URL(pageUrl)
  } catch {
    return []
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return []
  const exact = u.origin + u.pathname + u.search
  const seg = u.pathname.split('/')[1]
  const keys = [exact]
  if (seg) keys.push(`${u.origin}/${seg}`)
  keys.push(u.origin)
  return [...new Set(keys)]
}

/** Prefix of the keys holding an icon read by fetching the page. */
export const FETCHED = 'fetch:'

/** The remembered icon of `pageUrl`, or null: a visit's first, a fetch's last. Pure. */
export function lookupIcon(map: FaviconMap, pageUrl: string): string | null {
  const keys = iconKeys(pageUrl)
  for (const k of keys) if (map[k]) return map[k]
  return (keys[0] && map[FETCHED + keys[0]]) || null
}

/** Fold "fetching `pageUrl` found icon `iconUrl`" into the map (exact page
 * only, below any visit). Pure. */
export function rememberFetchedIcon(map: FaviconMap, pageUrl: string, iconUrl: string): FaviconMap {
  const key = iconKeys(pageUrl)[0]
  if (!key || !iconUrl || iconUrl.length > MAX_ICON || !/^(https?|data):/i.test(iconUrl)) return map
  return map[FETCHED + key] === iconUrl ? map : { ...map, [FETCHED + key]: iconUrl }
}

/** Fold "page `pageUrl` shows icon `iconUrl`" into the map, returning a NEW map
 * (the same one when nothing changes). The exact and segment keys always take
 * the new icon; the origin key only from the site's root page or when it has
 * none yet, so one deep page does not repaint every favorite of the site. Pure. */
export function rememberIcon(map: FaviconMap, pageUrl: string, iconUrl: string): FaviconMap {
  if (!iconUrl || iconUrl.length > MAX_ICON || !/^(https?|data):/i.test(iconUrl)) return map
  const keys = iconKeys(pageUrl)
  if (keys.length === 0) return map
  const origin = keys[keys.length - 1]
  const isRoot = keys.length === 1 || (keys.length === 2 && new URL(pageUrl).pathname === '/')
  const next = { ...map }
  for (const k of keys) {
    if (k === origin && !isRoot && next[k]) continue
    next[k] = iconUrl
  }
  return keys.every((k) => next[k] === map[k]) ? map : next
}

/** The icon a page's HTML declares, as an absolute url, or null: the first
 * rel="icon" / "shortcut icon" (an "alternate icon" only if nothing else), else
 * an apple-touch-icon. Pure. */
export function parseIconLink(html: string, baseUrl: string): string | null {
  const links = html.match(/<link\b[^>]*>/gi) ?? []
  const attr = (tag: string, name: string): string | null => {
    const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
    return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null
  }
  const pick = (want: (rel: string[]) => boolean): string | null => {
    for (const tag of links) {
      const rel = (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/)
      const href = attr(tag, 'href')
      if (!href || !want(rel)) continue
      try {
        return new URL(href.replace(/&amp;/g, '&'), baseUrl).href
      } catch {
        // malformed href: try the next link
      }
    }
    return null
  }
  return (
    // "alternate icon" is the fallback a page offers next to its real icon
    // (GitHub: a black png beside an svg that follows the dark theme).
    pick((rel) => rel.includes('icon') && !rel.includes('alternate')) ??
    pick((rel) => rel.includes('icon')) ??
    pick((rel) => rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed'))
  )
}

function sameOrigin(a: string, b: string): boolean | null {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return null
  }
}

/** Fetches a page's HTML (the profile's session, so its cookies apply), or null. */
export type FetchPage = (url: string) => Promise<{ url: string; html: string } | null>

/** Validate a parsed favicons.json. Pure. */
export function normalizeFaviconMap(raw: unknown): FaviconMap {
  const out: FaviconMap = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k && typeof v === 'string' && v && v.length <= MAX_ICON) out[k] = v
  }
  return out
}

/** The persisted cache: note what tabs show, look up / resolve for the bar. */
export class FaviconCache {
  private map: FaviconMap
  private saveTimer: NodeJS.Timeout | null = null
  /** Page fetches of this run, settled or not (hit or miss): a page is never
   * fetched twice, and a second caller waits for the first fetch. */
  private readonly fetches = new Map<string, Promise<void>>()

  constructor(private readonly file: string) {
    let raw: unknown = null
    try {
      if (existsSync(file)) raw = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      raw = null
    }
    this.map = normalizeFaviconMap(raw)
  }

  note(pageUrl: string, iconUrl: string | null | undefined): void {
    if (!iconUrl) return
    this.update(rememberIcon(this.map, pageUrl, iconUrl))
  }

  private update(next: FaviconMap): void {
    if (next === this.map) return
    this.map = next
    this.scheduleSave()
  }

  lookup(pageUrl: string): string | null {
    return lookupIcon(this.map, pageUrl)
  }

  /** The icons of `urls`, fetching the pages never seen (once per run, a few at
   * a time). A page that cannot be read, or that redirected to another site (a
   * login, a consent page: its icon is not this page's), maps to null (the bar
   * falls back to the site's /favicon.ico). */
  async resolve(urls: string[], fetchPage: FetchPage): Promise<Record<string, string | null>> {
    const unique = [...new Set(urls)]
    const pending = unique.filter((u) => this.fetches.has(u) && !this.lookup(u))
    const queue = unique.filter(
      (u) => !this.lookup(u) && iconKeys(u).length > 0 && !this.fetches.has(u)
    )
    const fetchOne = async (url: string): Promise<void> => {
      const page = await fetchPage(url).catch(() => null)
      if (!page || sameOrigin(page.url, url) === false) return
      const icon = parseIconLink(page.html, page.url)
      if (icon) this.update(rememberFetchedIcon(this.map, url, icon))
    }
    const worker = async (): Promise<void> => {
      for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
        const job = fetchOne(url)
        this.fetches.set(url, job)
        await job
      }
    }
    await Promise.all([
      worker(),
      worker(),
      worker(),
      worker(),
      ...pending.map((u) => this.fetches.get(u))
    ])
    return Object.fromEntries(unique.map((u) => [u, this.lookup(u)]))
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      try {
        mkdirSync(dirname(this.file), { recursive: true })
        const tmp = `${this.file}.tmp`
        writeFileSync(tmp, JSON.stringify(this.map))
        renameSync(tmp, this.file)
      } catch {
        // best effort: the cache rebuilds itself from visits
      }
    }, 2000)
    this.saveTimer.unref?.()
  }
}
