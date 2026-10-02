// Whether an extension popout window is attached to its profile window.
//
// A popout (chrome.windows.create — Bitwarden's passkey/unlock picker, a vault
// item popped out) used to be a free top-level window: the first click in the
// profile window sent it behind, where a full-size window covers it entirely,
// and nothing listed it. Seen 2026-10-02: a Bitwarden popout showing a card,
// still open and invisible behind the main window.
//
// Attached as a child, it stays in front of its profile window, moves with it
// and closes with it. But showing a child orders its PARENT in front of the
// other apps (main-native-gotchas.md #10), so a popout opened while the user is
// in another app would drag the whole browser over what they are doing. Hence
// the condition: attach only when the profile window already has the OS focus,
// and stay a free window otherwise — the same guard as mayShowToast (toast.ts).
//
// This file is the decision only, pure and tested; the window is built in
// extensions.ts (createExtensionPopout).

/** The slice of a BrowserWindow the decision reads. */
export interface PopoutParentCandidate {
  isDestroyed(): boolean
  isFocused(): boolean
}

/** True when the popout should be created as a child of `profileWindow`. */
export function shouldAttachPopout(profileWindow: PopoutParentCandidate | null): boolean {
  return !!profileWindow && !profileWindow.isDestroyed() && profileWindow.isFocused()
}
