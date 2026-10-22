// Linux fork: the tab icon is the first icon Chromium reports that really is an
// image. page-favicon-updated lists every icon the page declares, and Mira took
// the first one blindly: when that file is missing on the server (Goetic's
// intranet declares android-chrome-192x192.png, its server answers with the HTML
// of the app), the sidebar showed a letter badge although favicon-32x32.png was
// right there. Chrome falls back to the next candidate; so does Mira now.

/** Answers whether `url` serves an image (the profile's session). */
export type ProbeIcon = (url: string) => Promise<boolean>

/** Whether a response with this status and content-type is an icon. Pure. */
export function isIconResponse(ok: boolean, contentType: string | null): boolean {
  return ok && /^image\//i.test(contentType ?? '')
}

/** The first candidate that is an image, in the order given, or null when none
 * is. A data: url is taken as is (nothing to fetch). Probe results are memoized
 * in `seen` so a page that re-reports its icons is not refetched. */
export async function firstWorkingIcon(
  candidates: string[],
  probe: ProbeIcon,
  seen: Map<string, Promise<boolean>>
): Promise<string | null> {
  for (const url of candidates) {
    if (/^data:image\//i.test(url)) return url
    if (!/^https?:/i.test(url)) continue
    let p = seen.get(url)
    if (!p) {
      p = probe(url).catch(() => false)
      seen.set(url, p)
    }
    if (await p) return url
  }
  return null
}
