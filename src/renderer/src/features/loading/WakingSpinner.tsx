import { SpinnerGlyph } from './ReloadSpinner'

// Fills the page area while the active tab wakes up. Main keeps the tab's
// native view hidden until its page has painted (TabInfo.waking), because an
// unpainted view shows whatever sits beneath it; the chrome body is what shows
// through, so this spinner is what the user sees instead.
export function WakingSpinner(): React.JSX.Element {
  return (
    <div className="waking-host" role="status" aria-label="Waking tab">
      <span className="waking-spinner">
        <SpinnerGlyph />
      </span>
    </div>
  )
}
