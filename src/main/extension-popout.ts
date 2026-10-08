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

// --- The popout's page as a tab ------------------------------------------
//
// Chrome gives a popout window one tab, and Bitwarden closes its passkey picker
// through it: closeSingleActionPopout runs chrome.tabs.query({url:
// "chrome-extension://<id>/popup/index.html*"}), keeps the tab whose URL holds
// `singleActionPopout=vault_Fido2Popout_<session>`, then
// chrome.windows.remove(tab.windowId). A bare BrowserWindow is not a tab to the
// lib, so that query came back empty and the window stayed open after the
// passkey was saved (2026-10-08, kraken.com: passkey created, picker still up
// for nine minutes until closed by hand). extensions.ts therefore registers the
// popout's webContents as the tab of its window.
//
// Once it is a tab, chrome.tabs.remove can target it too, and the lib forwards
// that to Mira's removeTab hook, which only knows profile tabs. This registry
// lets the hook close the popout window instead of silently doing nothing.

/** The slice of a popout BrowserWindow the registry acts on. */
export interface PopoutWindowHandle {
  isDestroyed(): boolean
  close(): void
}

/** Popout windows keyed by the webContents the lib sees as their tab. */
export class ExtensionPopoutRegistry<Contents extends object = object> {
  private readonly byContents = new Map<Contents, PopoutWindowHandle>()

  register(contents: Contents, window: PopoutWindowHandle): void {
    this.byContents.set(contents, window)
  }

  unregister(contents: Contents): void {
    this.byContents.delete(contents)
  }

  /** Close the popout whose tab is `contents`. False when `contents` is not a
   * popout's, so the caller falls through to closing a profile tab. */
  closeIfPopout(contents: Contents): boolean {
    const window = this.byContents.get(contents)
    if (!window) return false
    this.byContents.delete(contents)
    if (!window.isDestroyed()) window.close()
    return true
  }
}
