// Minimize / maximize / close buttons at the right end of the toolbar, off
// macOS only: the window is frameless (no title bar, no buttons), which is fine
// on a Mac (traffic-light shortcuts, the dock) but leaves a KDE / GNOME / Windows
// user with no visible way to close it. Each button is a registry command, the
// same bus as the menu and the socket.

import type { ReactElement } from 'react'

export default function WindowControls(): ReactElement | null {
  // Read at render, not at import: App.tsx is imported by node-side tests.
  if (window.electron.process.platform === 'darwin') return null
  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-control"
        title="Minimize"
        aria-label="Minimize window"
        onClick={() => window.mira.command('minimize-window')}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 5.5h8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button
        type="button"
        className="window-control"
        title="Maximize / Restore"
        aria-label="Maximize or restore window"
        onClick={() => window.mira.command('set-window-maximized')}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect
            x="1"
            y="1"
            width="8"
            height="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      </button>
      <button
        type="button"
        className="window-control window-control-close"
        title="Close window"
        aria-label="Close window"
        onClick={() => window.mira.command('close-window')}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  )
}
