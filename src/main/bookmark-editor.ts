// The small "Edit bookmark" / "Add page" / "Add folder" window of the bookmarks-bar
// menu — Chrome's bookmark editor dialog. A native window, not a DOM dialog in
// the chrome: the bar sits right above the page, and a dialog drawn by the chrome
// would be hidden behind the WebContentsView (native gotcha #3).
//
// No preload: the page keeps a promise on `window.miraAnswer`, resolved on Save /
// Cancel, and main awaits it with executeJavaScript. Pure parts (HTML, answer
// parsing) are tested; only showBookmarkEditor touches Electron.

import { BrowserWindow } from 'electron'
import { escapeHtml } from './media-device-picker'

export type BookmarkEditorMode = 'edit-url' | 'edit-folder' | 'add-page' | 'add-folder'

export interface BookmarkEditorRequest {
  mode: BookmarkEditorMode
  title: string
  /** Prefilled url ('edit-url', 'add-page'); ignored for a folder. */
  url: string
}

export interface BookmarkEditorAnswer {
  title: string
  /** Absent for a folder. */
  url?: string
}

const HEADINGS: Record<BookmarkEditorMode, string> = {
  'edit-url': 'Edit Bookmark',
  'edit-folder': 'Rename Folder',
  'add-page': 'Add Page',
  'add-folder': 'Add Folder'
}

export function hasUrlField(mode: BookmarkEditorMode): boolean {
  return mode === 'edit-url' || mode === 'add-page'
}

export function renderBookmarkEditorHtml(req: BookmarkEditorRequest): string {
  const withUrl = hasUrlField(req.mode)
  const urlRow = withUrl
    ? `<label>URL<input id="url" type="text" spellcheck="false" value="${escapeHtml(req.url)}" /></label>`
    : ''
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
<title>${HEADINGS[req.mode]}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px system-ui, sans-serif; background: #1e1e1e; color: #e8e8e8;
    display: flex; flex-direction: column; height: 100vh; }
  h1 { margin: 0; padding: 16px 20px 4px; font-size: 15px; font-weight: 600; }
  main { flex: 1; padding: 8px 20px; display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 4px; color: #9a9a9a; font-size: 12px; }
  input { font: 13px system-ui, sans-serif; color: #e8e8e8; background: #2a2a2a;
    border: 1px solid #444; border-radius: 6px; padding: 7px 9px; outline: none; }
  input:focus { border-color: #4c8bf5; }
  footer { padding: 12px 20px; border-top: 1px solid #333; display: flex;
    justify-content: flex-end; gap: 8px; }
  button { border: none; border-radius: 6px; padding: 7px 16px; font: inherit; cursor: pointer; }
  .cancel { background: #3a3a3a; color: #e8e8e8; }
  .cancel:hover { background: #454545; }
  .save { background: #4c8bf5; color: #fff; }
  .save:hover { background: #5a95f6; }
  .save:disabled { background: #333; color: #777; cursor: default; }
</style>
</head>
<body>
  <h1>${HEADINGS[req.mode]}</h1>
  <main>
    <label>Name<input id="title" type="text" value="${escapeHtml(req.title)}" /></label>
    ${urlRow}
  </main>
  <footer>
    <button class="cancel" type="button" id="cancel">Cancel</button>
    <button class="save" type="button" id="save">Save</button>
  </footer>
  <script>
    var done;
    window.miraAnswer = new Promise(function (r) { done = r; });
    var title = document.getElementById('title');
    var url = document.getElementById('url');
    var save = document.getElementById('save');
    function check() {
      save.disabled = url ? url.value.trim() === '' : title.value.trim() === '';
    }
    function submit() {
      if (save.disabled) return;
      done(JSON.stringify(url ? { title: title.value, url: url.value } : { title: title.value }));
    }
    title.addEventListener('input', check);
    if (url) url.addEventListener('input', check);
    save.addEventListener('click', submit);
    document.getElementById('cancel').addEventListener('click', function () { done(''); });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') done('');
      else if (e.key === 'Enter') submit();
    });
    check();
    title.focus();
    title.select();
  </script>
</body>
</html>`
}

/** What the page reported: the fields, or null for Cancel / a malformed answer.
 * A folder needs a name, a page a url (an empty name is kept: the bar then shows
 * the icon alone, as Chrome does). */
export function parseBookmarkEditorAnswer(
  raw: unknown,
  mode: BookmarkEditorMode
): BookmarkEditorAnswer | null {
  if (typeof raw !== 'string' || raw === '') return null
  let obj: { title?: unknown; url?: unknown }
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object' || typeof obj.title !== 'string') return null
  const title = obj.title.trim()
  if (!hasUrlField(mode)) return title === '' ? null : { title }
  if (typeof obj.url !== 'string' || obj.url.trim() === '') return null
  return { title, url: obj.url.trim() }
}

/** Show the editor over `parent` and resolve with the answer, or null when
 * cancelled / closed. */
export function showBookmarkEditor(
  req: BookmarkEditorRequest,
  parent: BrowserWindow | null
): Promise<BookmarkEditorAnswer | null> {
  const win = new BrowserWindow({
    parent: parent ?? undefined,
    modal: parent != null,
    width: 460,
    height: hasUrlField(req.mode) ? 260 : 200,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: HEADINGS[req.mode],
    backgroundColor: '#1e1e1e',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  win.setMenuBarVisibility(false)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.once('ready-to-show', () => win.show())

  return new Promise((resolve) => {
    let settled = false
    const finish = (value: BookmarkEditorAnswer | null): void => {
      if (settled) return
      settled = true
      resolve(value)
      if (!win.isDestroyed()) win.close()
    }
    win.on('closed', () => finish(null))
    win
      .loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(renderBookmarkEditorHtml(req)))
      .then(() => win.webContents.executeJavaScript('window.miraAnswer'))
      .then((raw) => finish(parseBookmarkEditorAnswer(raw, req.mode)))
      .catch(() => finish(null))
  })
}
