// The address-bar camera button — Chrome's "this site is using your camera"
// icon, which Electron does not ship. Shown only while the active tab captures
// the camera or the microphone, or after the user cancelled Mira's device picker
// on that page (the page then believes access is blocked and stops asking).
// Clicking pops a native menu (show-media-capture-menu): devices in use, and a
// reset that reloads the page so the picker shows again. State lives in main
// (media-capture-state.ts); this component only renders TabInfo.mediaCapture.

import type { ReactElement } from 'react'
import type { TabInfo } from '../../../../preload/index.d'

export default function MediaCaptureButton({
  capture
}: {
  capture: TabInfo['mediaCapture']
}): ReactElement | null {
  if (!capture || (!capture.camera && !capture.microphone && !capture.blocked)) return null
  const inUse = capture.camera || capture.microphone
  const title = inUse
    ? capture.camera
      ? 'This page is using your camera'
      : 'This page is using your microphone'
    : 'Camera and microphone blocked on this page'
  // Camera icon while a camera (or nothing) is involved, mic icon for audio only.
  const showMic = capture.microphone && !capture.camera
  return (
    <button
      type="button"
      className={`nav-button media-capture-button${inUse ? ' active' : ' blocked'}`}
      title={title}
      aria-label={title}
      onClick={() => window.mira.command('show-media-capture-menu')}
    >
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        {showMic ? (
          <>
            <rect x="5.9" y="1.8" width="4.2" height="7.6" rx="2.1" fill="currentColor" />
            <path
              d="M3.6 7.6a4.4 4.4 0 0 0 8.8 0M8 12v2.2"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <rect x="1.6" y="4.3" width="9" height="7.4" rx="1.6" fill="currentColor" />
            <path d="M11.4 7.2 14.4 5.3v5.4l-3-1.9z" fill="currentColor" />
          </>
        )}
        {!inUse && (
          <path d="M2 14 14 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        )}
      </svg>
    </button>
  )
}
