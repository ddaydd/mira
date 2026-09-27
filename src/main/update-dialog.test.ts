import { describe, it, expect } from 'vitest'
import { updateDialogFor } from './update-dialog'

describe('updateDialogFor', () => {
  it('offers to install a newer release on a published build', () => {
    const d = updateDialogFor({ kind: 'newer', version: [1, 2, 0] }, '1.1.1', 'release')
    expect(d.message).toBe('Mira 1.2.0 is available')
    expect(d.buttons).toEqual(['Download and Install', 'Release Notes', 'Later'])
    expect(d.actions).toEqual([
      { kind: 'install' },
      { kind: 'open', url: 'https://github.com/micktaiwan/mira/releases/tag/v1.2.0' },
      { kind: 'none' }
    ])
    expect(d.buttons[d.cancelId]).toBe('Later')
  })

  it('never offers an install on a local build, and says why', () => {
    const d = updateDialogFor({ kind: 'newer', version: [1, 2, 0] }, '1.1.1', 'local')
    expect(d.actions.some((a) => a.kind === 'install')).toBe(false)
    expect(d.detail).toContain('local build')
    expect(d.actions[0]).toEqual({
      kind: 'open',
      url: 'https://github.com/micktaiwan/mira/releases/tag/v1.2.0'
    })
    expect(d.buttons[d.cancelId]).toBe('OK')
  })

  it('answers "up to date" and a failure too: a manual check always answers', () => {
    expect(updateDialogFor({ kind: 'up-to-date' }, '1.2.0', 'local')).toMatchObject({
      type: 'info',
      message: 'Mira is up to date',
      detail: 'Mira 1.2.0 is the latest release.'
    })
    expect(
      updateDialogFor({ kind: 'failed', error: 'GitHub answered 503' }, '1.2.0', 'release')
    ).toMatchObject({ type: 'warning', detail: 'GitHub answered 503', buttons: ['OK'] })
  })

  it('keeps one action per button', () => {
    for (const dist of ['release', 'local'] as const) {
      const d = updateDialogFor({ kind: 'newer', version: [2, 0, 0] }, '1.0.0', dist)
      expect(d.actions).toHaveLength(d.buttons.length)
    }
  })
})
