import { describe, it, expect, vi } from 'vitest'
import {
  closePageAsUser,
  holdQuitForPageBeacons,
  type ClosablePage,
  type QuitGraceApp
} from './quit-grace'

function fakeApp(): QuitGraceApp & {
  fire: () => { prevented: boolean }
  exit: ReturnType<typeof vi.fn<(code?: number) => void>>
} {
  const listeners: Array<(e: { preventDefault: () => void }) => void> = []
  return {
    on: (_event, listener) => listeners.push(listener),
    exit: vi.fn<(code?: number) => void>(),
    fire: () => {
      const result = { prevented: false }
      for (const l of listeners) l({ preventDefault: () => (result.prevented = true) })
      return result
    }
  }
}

describe('holdQuitForPageBeacons', () => {
  it('holds the quit, then exits after the grace period', () => {
    const app = fakeApp()
    const pending: Array<[() => void, number]> = []
    holdQuitForPageBeacons(app, 800, (fn, ms) => pending.push([fn, ms]))
    expect(app.fire().prevented).toBe(true)
    expect(app.exit).not.toHaveBeenCalled()
    expect(pending.map(([, ms]) => ms)).toEqual([800])
    pending[0][0]()
    expect(app.exit).toHaveBeenCalledWith(0)
  })

  it('holds only once', () => {
    const app = fakeApp()
    const pending: Array<() => void> = []
    holdQuitForPageBeacons(app, 800, (fn) => pending.push(fn))
    app.fire()
    expect(app.fire().prevented).toBe(false)
    expect(pending).toHaveLength(1)
  })
})

describe('closePageAsUser', () => {
  type FakePage = ClosablePage & {
    destroyed: boolean
    sent: string[]
    close: ReturnType<typeof vi.fn<() => void>>
  }
  function fakePage(
    opts: { destroyed?: boolean; cdpFails?: boolean; attachThrows?: boolean } = {}
  ): FakePage {
    const page: FakePage = {
      destroyed: opts.destroyed ?? false,
      sent: [] as string[],
      isDestroyed: () => page.destroyed,
      close: vi.fn<() => void>(() => {
        page.destroyed = true
      }),
      debugger: {
        isAttached: () => false,
        attach: () => {
          if (opts.attachThrows) throw new Error('already attached by devtools')
        },
        sendCommand: (method: string) => {
          page.sent.push(method)
          return opts.cdpFails ? Promise.reject(new Error('no target')) : Promise.resolve({})
        }
      }
    }
    return page
  }

  it('closes through CDP Page.close, with the bare close() as a timed fallback', () => {
    const page = fakePage()
    const pending: Array<[() => void, number]> = []
    closePageAsUser(page, 1000, (fn, ms) => pending.push([fn, ms]))
    expect(page.sent).toEqual(['Page.close'])
    expect(page.close).not.toHaveBeenCalled()
    expect(pending[0][1]).toBe(1000)
    pending[0][0]() // still alive after the grace
    expect(page.close).toHaveBeenCalledTimes(1)
  })

  it('skips the fallback when the page closed itself in time', () => {
    const page = fakePage()
    const pending: Array<() => void> = []
    closePageAsUser(page, 1000, (fn) => pending.push(fn))
    page.destroyed = true
    pending[0]()
    expect(page.close).not.toHaveBeenCalled()
  })

  it('falls back at once when CDP is unavailable', async () => {
    const page = fakePage({ attachThrows: true })
    closePageAsUser(page, 1000, () => {})
    expect(page.close).toHaveBeenCalledTimes(1)
    const rejected = fakePage({ cdpFails: true })
    closePageAsUser(rejected, 1000, () => {})
    await Promise.resolve()
    await Promise.resolve()
    expect(rejected.close).toHaveBeenCalledTimes(1)
  })

  it('leaves a destroyed page alone', () => {
    const page = fakePage({ destroyed: true })
    closePageAsUser(page, 1000, () => {})
    expect(page.sent).toEqual([])
    expect(page.close).not.toHaveBeenCalled()
  })
})
