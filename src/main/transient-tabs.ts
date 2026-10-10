// Tabs left out of sessions.json (Linux fork). The Settings tab already was;
// a tab showing Mira's download page is too: its saved URL is the one the file
// came from (the address bar mirrors it), so restoring it downloaded the file a
// second time at every launch ("name (1).zip"). Pure, so it is tested.

import { isMiraDownloadUrl } from './download-doc'

/** Ids of the tabs not to persist: the Settings tab, and every tab whose page is
 * the download page. `pageUrls` = [tabId, the URL its view really shows]. */
export function transientTabIds(
  settingsTabId: string | null | undefined,
  pageUrls: Iterable<[string, string]>
): Set<string> {
  const ids = new Set<string>()
  if (settingsTabId) ids.add(settingsTabId)
  for (const [id, url] of pageUrls) if (isMiraDownloadUrl(url)) ids.add(id)
  return ids
}
