import { describe, it, expect } from 'vitest'
import { formatTabCloseLog } from './tab-close-log'

describe('formatTabCloseLog', () => {
  it('names the tab, its window and the path that closed it', () => {
    expect(formatTabCloseLog({ reason: 'extension', tabId: 't-1', windowId: 'w-1' })).toBe(
      '[mira-tab] close tab=t-1 window=w-1 reason=extension'
    )
  })

  it('adds the command origin when there is one (ui vs external)', () => {
    expect(
      formatTabCloseLog({
        reason: 'close-active-tab',
        tabId: 't-1',
        windowId: 'w-1',
        origin: 'external'
      })
    ).toBe('[mira-tab] close tab=t-1 window=w-1 reason=close-active-tab origin=external')
  })
})
