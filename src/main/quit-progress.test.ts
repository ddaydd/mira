import { describe, it, expect } from 'vitest'
import {
  QuitTimeline,
  formatQuitStep,
  lockingStepLabel,
  setStepScript,
  QUIT_PROGRESS_HTML
} from './quit-progress'

describe('QuitTimeline', () => {
  it('logs every step relative to the first one', () => {
    let t = 1000
    const lines: string[] = []
    const timeline = new QuitTimeline(
      () => t,
      (line) => lines.push(line)
    )
    timeline.mark('quit confirmed')
    t += 2350
    timeline.mark('vaults locked')
    t += 40
    timeline.mark('will-quit')
    expect(lines).toEqual([
      '[mira-quit] +0ms quit confirmed',
      '[mira-quit] +2350ms vaults locked',
      '[mira-quit] +2390ms will-quit'
    ])
  })

  it('times a new quit attempt from its own start', () => {
    let t = 0
    const lines: string[] = []
    const timeline = new QuitTimeline(
      () => t,
      (line) => lines.push(line)
    )
    timeline.begin('quit confirmed')
    t += 500
    timeline.mark('vaults locked')
    t += 7_200_000
    timeline.begin('quit confirmed')
    expect(lines[2]).toBe('[mira-quit] +0ms quit confirmed')
  })

  it('never prints a negative or fractional duration', () => {
    expect(formatQuitStep(-3, 'x')).toBe('[mira-quit] +0ms x')
    expect(formatQuitStep(12.6, 'x')).toBe('[mira-quit] +13ms x')
  })
})

describe('quit progress window', () => {
  it('names the profile being locked, or stays generic without one', () => {
    expect(lockingStepLabel('Perso')).toBe('Locking encrypted profile “Perso”')
    expect(lockingStepLabel('  ')).toBe('Locking encrypted profile')
    expect(lockingStepLabel(undefined)).toBe('Locking encrypted profile')
  })

  it('sets the step as text, never as markup (a profile label is user text)', () => {
    const script = setStepScript('a "quoted" <b>label</b>')
    expect(script).toContain('.textContent = "a \\"quoted\\" <b>label</b>"')
    expect(script).not.toContain('innerHTML')
  })

  it('has the step element the script targets', () => {
    expect(QUIT_PROGRESS_HTML).toContain('id="step"')
  })
})
