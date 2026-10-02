import { describe, it, expect } from 'vitest'
import { shouldAttachPopout, type PopoutParentCandidate } from './extension-popout'

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
