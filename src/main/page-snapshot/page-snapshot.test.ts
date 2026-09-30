import { describe, it, expect } from 'vitest'
import {
  groupSnapshot,
  interpretSelect,
  parseRef,
  refTargetScript,
  selectOptionScript,
  snapshotScript
} from './page-snapshot'

const raw = {
  url: 'https://flights.example/',
  title: 'Flights',
  viewport: { w: 1120, h: 780 },
  scroll: { y: 0, height: 2000 },
  text: 'Where to?',
  omitted: 0,
  actions: [
    { node: 3, kind: 'fill', role: 'combobox', label: 'Where to?', value: '', id: 'e1' },
    { node: 3, kind: 'click', role: 'combobox', label: 'Open Where to?', value: '', id: 'e2' },
    {
      node: 7,
      kind: 'click',
      role: 'checkbox',
      label: 'Direct only',
      value: 'on',
      checked: 'false',
      id: 'e3'
    },
    {
      node: 9,
      kind: 'select',
      role: 'combobox',
      label: 'Class → Business',
      value: 'biz',
      current_value: 'Economy',
      id: 'e4'
    },
    {
      node: 9,
      kind: 'select',
      role: 'combobox',
      label: 'Class → First',
      value: 'first',
      current_value: 'Economy',
      id: 'e5'
    },
    { id: 'scroll_down', kind: 'scroll', label: 'Scroll down' },
    { id: 'wait', kind: 'wait', label: 'Wait for the page to update' }
  ]
}

describe('groupSnapshot', () => {
  it('folds actions into one row per element, like jev action_space', () => {
    const snap = groupSnapshot(raw)
    if ('error' in snap) throw new Error(snap.error)
    expect(snap.elements).toEqual([
      { ref: 3, role: 'combobox', label: 'Where to?', value: '', ops: ['type', 'click'] },
      {
        ref: 7,
        role: 'checkbox',
        label: 'Direct only',
        value: 'on',
        checked: 'false',
        ops: ['click']
      },
      {
        ref: 9,
        role: 'combobox',
        label: 'Class',
        value: 'Economy',
        ops: ['select'],
        options: [
          { value: 'biz', label: 'Business' },
          { value: 'first', label: 'First' }
        ]
      }
    ])
    expect(snap.url).toBe('https://flights.example/')
    expect(snap.scroll).toEqual({ y: 0, height: 2000 })
  })

  it('reports a navigating page instead of an empty table', () => {
    expect(groupSnapshot(null)).toEqual({ error: 'the page is navigating; try again' })
  })
})

describe('parseRef', () => {
  it('accepts positive integers only', () => {
    expect(parseRef(4)).toBe(4)
    for (const bad of [0, -1, 1.5, '4', undefined]) expect(parseRef(bad)).toHaveProperty('error')
  })
})

describe('scripts', () => {
  it('snapshot embeds the vendored jev reader and keeps guards in the page', () => {
    const s = snapshotScript()
    expect(s).toContain('window.__jevFast ||=')
    expect(s).toContain('c.last = {')
    // A syntax error would only show up in the page; parse it here.
    expect(() => new Function(`return ${s}`)).not.toThrow()
  })

  it('by-ref scripts parse, and check freshness before anything else', () => {
    for (const s of [
      refTargetScript(3, 'click'),
      refTargetScript(3, 'type'),
      selectOptionScript(9, { value: 'biz' }),
      selectOptionScript(9, { label: 'It\'s "First"' })
    ]) {
      expect(() => new Function(`return ${s}`)).not.toThrow()
      expect(s.indexOf('take a new one')).toBeGreaterThan(-1)
    }
    expect(refTargetScript(3, 'type')).toContain('read-only')
    expect(refTargetScript(3, 'click')).not.toContain('read-only')
  })
})

describe('interpretSelect', () => {
  it('passes the in-page reason through', () => {
    expect(interpretSelect({ ok: false, reason: 'ref 9 has no such option' })).toEqual({
      error: 'ref 9 has no such option'
    })
    expect(
      interpretSelect({ ok: true, value: 'biz', label: 'Business', target: '[9] <select>' })
    ).toEqual({
      value: 'biz',
      label: 'Business',
      target: '[9] <select>'
    })
  })
})
