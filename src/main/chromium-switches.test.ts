import { describe, expect, it } from 'vitest'
import { applyChromiumSwitches, CHROMIUM_SWITCHES } from './chromium-switches'

describe('chromium switches', () => {
  it('keeps a covered window taking scripted input', () => {
    expect(CHROMIUM_SWITCHES.map((s) => s.name)).toContain('disable-backgrounding-occluded-windows')
  })

  it('appends every switch, with its value only when it has one', () => {
    const calls: unknown[][] = []
    applyChromiumSwitches({ appendSwitch: (...args: unknown[]) => void calls.push(args) })
    expect(calls).toEqual(
      CHROMIUM_SWITCHES.map((s) => (s.value === undefined ? [s.name] : [s.name, s.value]))
    )
  })
})
