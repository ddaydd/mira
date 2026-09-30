// The CLI half of snapshot-driven input: `mira snap`, `click <ref>`, `type`,
// `select`, alone and inside a batch.
import { describe, it, expect } from 'vitest'
import {
  buildClick,
  buildLineRequest,
  buildSelect,
  buildSnapshot,
  buildType,
  clickPositional,
  formatSnapshot
} from './mira-core.mjs'

const env = { tabId: null, cwd: '/tmp', home: '/Users/me' }

describe('snapshot verbs', () => {
  it('snap targets the pinned tab', () => {
    expect(buildSnapshot('t1')).toEqual({ command: 'snapshot', params: { tabId: 't1' } })
    expect(buildSnapshot(null)).toEqual({ command: 'snapshot', params: {} })
  })

  it('click takes a ref by flag or as a bare integer, and keeps x,y a point', () => {
    expect(buildClick(null, { ref: '4' })).toEqual({
      request: { command: 'click', params: { ref: 4 } }
    })
    expect(clickPositional({}, ['4'])).toEqual({ at: undefined, ref: '4' })
    expect(clickPositional({}, ['4,5'])).toEqual({ at: '4,5', ref: undefined })
    expect(buildClick(null, { at: '4' })).toHaveProperty('error')
    expect(buildClick(null, { at: '4,5' }).request.params).toEqual({ x: 4, y: 5 })
    expect(buildClick(null, { ref: '0' })).toHaveProperty('error')
  })

  it('type needs a ref and some text', () => {
    expect(buildType(null, '3', 'London')).toEqual({
      request: { command: 'type-text', params: { ref: 3, text: 'London' } }
    })
    expect(buildType(null, 'x', 'London')).toHaveProperty('error')
    expect(buildType(null, '3', '')).toEqual({ error: 'type needs <ref> <text>' })
  })

  it('select takes a label or a value, never both', () => {
    expect(buildSelect(null, '2', { label: 'Business' }).request.params).toEqual({
      ref: 2,
      label: 'Business'
    })
    expect(buildSelect(null, '2', { value: 'biz' }).request.params).toEqual({
      ref: 2,
      value: 'biz'
    })
    expect(buildSelect(null, '2', {})).toHaveProperty('error')
    expect(buildSelect(null, '2', { label: 'a', value: 'b' })).toHaveProperty('error')
  })

  it('works line by line in a batch, multi-word text included', () => {
    expect(buildLineRequest(['snap'], env)).toEqual({
      request: { command: 'snapshot', params: {} }
    })
    expect(buildLineRequest(['type', '3', 'New', 'York'], env)).toEqual({
      request: { command: 'type-text', params: { ref: 3, text: 'New York' } }
    })
    expect(buildLineRequest(['click', '7'], env)).toEqual({
      request: { command: 'click', params: { ref: 7 } }
    })
    expect(buildLineRequest(['select', '2', '--value', 'biz'], env)).toEqual({
      request: { command: 'select-option', params: { ref: 2, value: 'biz' } }
    })
  })
})

describe('formatSnapshot', () => {
  it('prints one line per element, then the visible text', () => {
    const out = formatSnapshot({
      title: 'Flights',
      url: 'https://f.example/',
      viewport: { w: 800, h: 600 },
      scroll: { y: 0, height: 1800 },
      text: 'Where to?',
      omitted: 0,
      elements: [
        { ref: 1, role: 'textbox', label: 'Where to?', value: 'Paris', ops: ['type', 'click'] },
        {
          ref: 3,
          role: 'checkbox',
          label: 'Direct only',
          value: 'on',
          checked: 'false',
          ops: ['click']
        },
        {
          ref: 2,
          role: 'combobox',
          label: 'Class',
          value: 'Economy',
          ops: ['select'],
          options: [{ value: 'biz', label: 'Business' }]
        }
      ]
    })
    expect(out).toBe(
      [
        'Flights — https://f.example/',
        '[1] textbox "Where to?" = "Paris"  (type, click)',
        '[3] checkbox "Direct only" = "on" checked=false',
        '[2] combobox "Class" = "Economy"  (select)  options: "Business"',
        '(scrolled 0 of 1800px; more below)',
        '',
        'Where to?'
      ].join('\n')
    )
  })
})
