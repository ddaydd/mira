// Pure overflow rule for the bookmarks bar, split out so it is unit-tested
// without a DOM: given each item's right edge (px from the strip's left) and the
// strip's width, the index of the first item that does not fully fit, or null
// when everything fits. Items after a non-fitting one are hidden too, so the »
// menu lists a contiguous tail (show-bookmarks-menu takes a `fromIndex`).

export function firstHiddenIndex(rightEdges: readonly number[], stripWidth: number): number | null {
  const i = rightEdges.findIndex((right) => right > stripWidth)
  return i === -1 ? null : i
}
