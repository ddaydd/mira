import { describe, it, expect } from 'vitest'
import { firstHiddenIndex } from './overflow'

describe('firstHiddenIndex', () => {
  it('is null when every item fits', () => {
    expect(firstHiddenIndex([80, 160, 240], 300)).toBeNull()
    expect(firstHiddenIndex([], 300)).toBeNull()
  })

  it('points at the first item whose right edge passes the strip', () => {
    expect(firstHiddenIndex([80, 160, 240, 320], 300)).toBe(3)
  })

  it('keeps an item that ends exactly on the edge', () => {
    expect(firstHiddenIndex([150, 300, 301], 300)).toBe(2)
  })

  it('hides everything when even the first item is too wide', () => {
    expect(firstHiddenIndex([400, 450], 300)).toBe(0)
  })
})
