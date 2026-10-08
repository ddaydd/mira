import { describe, it, expect } from 'vitest'
import {
  ExtensionPopoutRegistry,
  shouldAttachPopout,
  type PopoutParentCandidate,
  type PopoutWindowHandle
} from './extension-popout'

const win = (destroyed: boolean, focused: boolean): PopoutParentCandidate => ({
  isDestroyed: () => destroyed,
  isFocused: () => focused
})

describe('shouldAttachPopout (pure)', () => {
  it('attaches to a live profile window that has the OS focus', () => {
    expect(shouldAttachPopout(win(false, true))).toBe(true)
  })

  it('stays a free window when the profile window is in the background', () => {
    expect(shouldAttachPopout(win(false, false))).toBe(false)
  })

  it('stays a free window when there is no profile window', () => {
    expect(shouldAttachPopout(null)).toBe(false)
  })

  it('never reads the focus of a destroyed window', () => {
    const destroyed = {
      isDestroyed: () => true,
      isFocused: () => {
        throw new Error('Object has been destroyed')
      }
    }
    expect(shouldAttachPopout(destroyed)).toBe(false)
  })
})

const popout = (destroyed = false): PopoutWindowHandle & { closed: number } => {
  const handle = {
    closed: 0,
    isDestroyed: () => destroyed,
    close: () => {
      handle.closed++
    }
  }
  return handle
}

describe('ExtensionPopoutRegistry (pure)', () => {
  it('closes the popout window when its tab is removed', () => {
    const registry = new ExtensionPopoutRegistry()
    const contents = {}
    const win = popout()
    registry.register(contents, win)
    expect(registry.closeIfPopout(contents)).toBe(true)
    expect(win.closed).toBe(1)
  })

  it('leaves a profile tab to the caller', () => {
    const registry = new ExtensionPopoutRegistry()
    registry.register({}, popout())
    expect(registry.closeIfPopout({})).toBe(false)
  })

  it('forgets a popout once it closed by itself', () => {
    const registry = new ExtensionPopoutRegistry()
    const contents = {}
    const win = popout()
    registry.register(contents, win)
    registry.unregister(contents)
    expect(registry.closeIfPopout(contents)).toBe(false)
    expect(win.closed).toBe(0)
  })

  it('claims the tab of a destroyed popout without touching the window', () => {
    // The lib calls removeTab when the closed window's webContents is
    // destroyed; that must not fall through to closing a profile tab.
    const registry = new ExtensionPopoutRegistry()
    const contents = {}
    const win = popout(true)
    registry.register(contents, win)
    expect(registry.closeIfPopout(contents)).toBe(true)
    expect(win.closed).toBe(0)
  })
})
