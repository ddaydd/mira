// The ☰ button that pops the application menu (File, Edit, Bookmarks…) under
// itself. Off macOS only: there the frameless window has no menu bar, so without
// it the menus — the Bookmarks list above all — are out of reach. On macOS the
// same menu lives in the system menu bar and the button would be a duplicate.

import type { MouseEvent, ReactElement } from 'react'

export default function AppMenuButton(): ReactElement | null {
  // Read at render, not at import: App.tsx is imported by node-side tests.
  if (window.electron.process.platform === 'darwin') return null
  const onClick = (e: MouseEvent<HTMLButtonElement>): void => {
    // Anchor the dropdown just under the button.
    const rect = e.currentTarget.getBoundingClientRect()
    window.mira.command('show-app-menu', { x: rect.left, y: rect.bottom })
  }
  return (
    <button
      type="button"
      className="nav-button"
      title="Menu (bookmarks, settings…)"
      aria-label="Application menu"
      onClick={onClick}
    >
      ☰
    </button>
  )
}
