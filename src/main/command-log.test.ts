import { describe, expect, it } from 'vitest'
import { formatCommandEntry, LastCommand } from './command-log'

const AT = Date.UTC(2026, 9, 5, 12, 0, 0)

describe('formatCommandEntry', () => {
  it('writes time, outcome, client and command', () => {
    expect(
      formatCommandEntry({ at: AT, client: 'mira-cli session=abc', command: 'navigate', ok: true })
    ).toBe('2026-10-05T12:00:00.000Z | OK | mira-cli session=abc | navigate')
  })

  it('keeps a refused request visible, with its error on one line', () => {
    expect(
      formatCommandEntry({
        at: AT,
        client: null,
        command: 'ping',
        ok: false,
        error: 'missing\n"client"'
      })
    ).toBe('2026-10-05T12:00:00.000Z | FAIL | - | ping | missing "client"')
  })
})

describe('LastCommand', () => {
  it('says none before any request', () => {
    expect(new LastCommand().describe(AT)).toBe('lastCommand=none')
  })

  it('names the last request, its client and how long ago', () => {
    const last = new LastCommand()
    last.record({ at: AT, client: 'a', command: 'new-tab', ok: true })
    last.record({ at: AT + 10, client: 'mira-cli session=x', command: 'activate-tab', ok: true })
    expect(last.describe(AT + 50)).toBe(
      'lastCommand=activate-tab client="mira-cli session=x" ago=40ms'
    )
  })
})
