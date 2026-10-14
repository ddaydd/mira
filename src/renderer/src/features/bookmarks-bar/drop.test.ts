import { describe, it, expect } from 'vitest'
import { dropSlot, droppedPage, MIRA_PAGE_MIME } from './drop'

const items = [
  { left: 0, right: 100 },
  { left: 102, right: 202 }
]

describe('dropSlot', () => {
  it('goes before the item whose middle is right of the pointer', () => {
    expect(dropSlot(items, 10)).toEqual({ index: 0, markerX: -1 })
    expect(dropSlot(items, 60)).toEqual({ index: 1, markerX: 101 })
    expect(dropSlot(items, 140)).toEqual({ index: 1, markerX: 101 })
  })

  it('goes after the last item past its middle, and at 0 on an empty bar', () => {
    expect(dropSlot(items, 180)).toEqual({ index: 2, markerX: 203 })
    expect(dropSlot([], 50)).toEqual({ index: 0, markerX: 0 })
  })
})

describe('droppedPage', () => {
  const from = (data: Record<string, string>) => (type: string) => data[type] ?? ''

  it("prefers Mira's own payload, title included", () => {
    const own = JSON.stringify({ url: 'https://a.example/', title: 'A' })
    expect(droppedPage(from({ [MIRA_PAGE_MIME]: own, 'text/uri-list': 'https://b/' }))).toEqual({
      url: 'https://a.example/',
      title: 'A'
    })
  })

  it('falls back to the first url of a url list, skipping comments', () => {
    expect(droppedPage(from({ 'text/uri-list': '# c\r\nhttps://b.example/x\r\n' }))).toEqual({
      url: 'https://b.example/x'
    })
  })

  it('ignores non-web urls and empty drags', () => {
    expect(droppedPage(from({ 'text/uri-list': 'javascript:alert(1)' }))).toBeNull()
    expect(droppedPage(from({}))).toBeNull()
  })
})
