// Linux fork: favicons in the NATIVE menus of the bookmarks bar (a folder's
// dropdown, the » overflow). The bar itself draws icons with <img>, which reads
// any format; a native menu item needs a NativeImage, and nativeImage only
// decodes PNG / JPEG — most favicons are .ico, some SVG or WebP. So an icon goes:
// its url (favicon-cache.ts: what the page declared, else the site's
// /favicon.ico) → bytes, fetched with the profile's session → a data: url →
// redrawn as a 32 px PNG by the window's own chrome (a canvas reads every format
// Chromium does, and a data: image never taints it) → NativeImage at scale 2,
// i.e. 16 px. Kept in memory for the run; a miss is remembered too.
//
// The menu waits a little for icons it has never seen (the first open of a
// folder), then shows what it has: the rest are there on the next open.

/** `Via` is what a load runs through (the window: its session fetches, its
 * chrome redraws), handed back to fetchIcon / rasterize. */
export interface MenuFaviconDeps<Image, Via> {
  /** The icon url a page declared, from the favicon cache (null: unknown). */
  lookup: (pageUrl: string) => string | null
  /** Bytes + content type of an icon url, or null (failed, not an image). */
  fetchIcon: (iconUrl: string, via: Via) => Promise<{ bytes: Buffer; type: string } | null>
  /** Redraw any image data: url as a PNG data: url (null: undecodable). */
  rasterize: (dataUrl: string, via: Via) => Promise<string | null>
  /** A PNG data: url as a menu image. */
  toImage: (pngDataUrl: string) => Image
}

/** Where to look for a page's icon, best first: the icon the page declared, then
 * the site's /favicon.ico. Empty for a non-web url. Pure. */
export function iconCandidates(pageUrl: string, declared: string | null): string[] {
  let origin: string
  try {
    const u = new URL(pageUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return []
    origin = u.origin
  } catch {
    return []
  }
  return [...new Set([...(declared ? [declared] : []), `${origin}/favicon.ico`])]
}

/** An image's bytes as a data: url, typed from the response, else sniffed from
 * the first bytes (servers often send .ico as octet-stream). Null when it does
 * not look like an image (an HTML error page served with a 200). Pure. */
export function imageDataUrl(bytes: Buffer, type: string): string | null {
  const declared = type.split(';')[0].trim().toLowerCase()
  const head = bytes.subarray(0, 12)
  const sniffed =
    head[0] === 0x89 && head.toString('latin1', 1, 4) === 'PNG'
      ? 'image/png'
      : head[0] === 0xff && head[1] === 0xd8
        ? 'image/jpeg'
        : head.toString('latin1', 0, 3) === 'GIF'
          ? 'image/gif'
          : head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP'
            ? 'image/webp'
            : head[0] === 0 && head[1] === 0 && (head[2] === 1 || head[2] === 2) && head[3] === 0
              ? 'image/x-icon'
              : /^\s*(<\?xml|<svg)/i.test(bytes.toString('utf8', 0, 200))
                ? 'image/svg+xml'
                : null
  const mime = sniffed ?? (declared.startsWith('image/') ? declared : null)
  if (!mime || bytes.length === 0) return null
  return `data:${mime};base64,${bytes.toString('base64')}`
}

/** The script the chrome runs to redraw `dataUrl` as a 32 px PNG data: url. */
export function rasterizeScript(dataUrl: string): string {
  return `new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = 32
        c.height = 32
        c.getContext('2d').drawImage(img, 0, 0, 32, 32)
        resolve(c.toDataURL('image/png'))
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    setTimeout(() => resolve(null), 3000)
    img.src = ${JSON.stringify(dataUrl)}
  })`
}

export class MenuFavicons<Image, Via> {
  /** By page url: the image, or null for "tried, none". */
  private readonly images = new Map<string, Image | null>()
  private readonly loading = new Map<string, Promise<void>>()

  constructor(private readonly deps: MenuFaviconDeps<Image, Via>) {}

  /** The icon of a page already loaded, undefined otherwise. */
  get(pageUrl: string): Image | undefined {
    return this.images.get(pageUrl) ?? undefined
  }

  /** Load the icons of `pageUrls` not tried yet, waiting at most `waitMs` (the
   * loads go on after that, for the next open). */
  async load(pageUrls: string[], waitMs: number, via: Via): Promise<void> {
    const jobs = [...new Set(pageUrls)]
      .filter((u) => !this.images.has(u))
      .map((u) => this.loading.get(u) ?? this.start(u, via))
    if (jobs.length === 0) return
    await Promise.race([
      Promise.all(jobs),
      new Promise<void>((resolve) => setTimeout(resolve, waitMs))
    ])
  }

  private start(pageUrl: string, via: Via): Promise<void> {
    const job = this.loadOne(pageUrl, via)
      .catch(() => null)
      .then((image) => {
        this.images.set(pageUrl, image)
        this.loading.delete(pageUrl)
      })
    this.loading.set(pageUrl, job)
    return job
  }

  private async loadOne(pageUrl: string, via: Via): Promise<Image | null> {
    for (const iconUrl of iconCandidates(pageUrl, this.deps.lookup(pageUrl))) {
      const dataUrl = iconUrl.startsWith('data:')
        ? iconUrl
        : await this.deps
            .fetchIcon(iconUrl, via)
            .then((r) => (r ? imageDataUrl(r.bytes, r.type) : null))
      if (!dataUrl) continue
      const png = await this.deps.rasterize(dataUrl, via)
      if (png) return this.deps.toImage(png)
    }
    return null
  }
}
