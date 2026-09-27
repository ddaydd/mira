// The native half of quit-progress.ts: a small window that says Mira is quitting
// and which step it is on. Shown by index.ts when the quit is deferred to re-lock
// encrypted profiles. The user asked to quit, so it may come to the front: it
// takes no focus and nothing else is left for it to cover. Not unit-tested.

import { BrowserWindow, screen } from 'electron'
import { QUIT_PROGRESS_SIZE, QUIT_PROGRESS_URL, setStepScript } from './quit-progress'

export interface QuitProgress {
  setStep: (label: string) => void
  close: () => void
}

export function showQuitProgress(): QuitProgress {
  const { workArea } = screen.getPrimaryDisplay()
  const win = new BrowserWindow({
    ...QUIT_PROGRESS_SIZE,
    x: Math.round(workArea.x + (workArea.width - QUIT_PROGRESS_SIZE.width) / 2),
    y: Math.round(workArea.y + workArea.height / 3),
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#1b1b1f',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  let pending: string | null = null
  let loaded = false
  const apply = (label: string): void => {
    if (win.isDestroyed()) return
    win.webContents.executeJavaScript(setStepScript(label)).catch(() => {})
  }
  win.webContents.once('did-finish-load', () => {
    loaded = true
    if (pending !== null) apply(pending)
  })
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.showInactive()
  })
  win.loadURL(QUIT_PROGRESS_URL).catch(() => {})
  return {
    setStep: (label) => {
      pending = label
      if (loaded) apply(label)
    },
    close: () => {
      if (!win.isDestroyed()) win.destroy()
    }
  }
}
