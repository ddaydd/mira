import { describe, expect, it } from 'vitest'
import { AudibleHold } from './audible-hold'

describe('AudibleHold', () => {
  it('keeps a tab audible through a short pause', () => {
    const h = new AudibleHold(1000)
    h.note('t1', true, 0)
    h.note('t1', false, 100)
    expect(h.isAudible('t1', false, 1099)).toBe(true)
    h.note('t1', true, 600)
    expect(h.isAudible('t1', true, 600)).toBe(true)
  })

  it('drops the icon once the silence outlasts the hold', () => {
    const h = new AudibleHold(1000)
    h.note('t1', false, 100)
    expect(h.isAudible('t1', false, 1100)).toBe(false)
    expect(h.isAudible('t1', false, 1150)).toBe(false)
  })

  it('a new pause restarts the hold', () => {
    const h = new AudibleHold(1000)
    h.note('t1', false, 0)
    h.note('t1', true, 500)
    h.note('t1', false, 900)
    expect(h.isAudible('t1', false, 1800)).toBe(true)
  })

  it('never invents sound for a tab that never played', () => {
    const h = new AudibleHold(1000)
    expect(h.isAudible('t2', false, 0)).toBe(false)
    expect(h.isAudible('t2', true, 0)).toBe(true)
  })

  it('forgets a closed tab', () => {
    const h = new AudibleHold(1000)
    h.note('t1', false, 0)
    h.forget('t1')
    expect(h.isAudible('t1', false, 10)).toBe(false)
  })
})
