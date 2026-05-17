import type { DOMElement } from './dom'
import type { Rectangle } from './layout/geometry'

/**
 * Cached layout bounds for each rendered node (used for blit + clearing).
 * `top` is the yoga-local getComputedTop() — stored so ScrollBox viewport
 * culling can skip yoga reads for clean children whose position hasn't
 * shifted (O(dirty) instead of O(mounted) first-pass).
 *
 * `shadowExtent` is the elevation level the node painted with last frame.
 * When non-zero, the node's `<Surface elevation>` shadow extended `n`
 * cells down-right beyond its own rect, so the clear/damage path needs
 * to extend by the same amount or the old shadow band remains visible
 * after a move / shrink / elevation drop. Stored alongside the layout
 * rect (not folded INTO width/height) so hit-test / click coords keep
 * using the node's true rect, while only the clear path inflates.
 */
export type CachedLayout = {
  x: number
  y: number
  width: number
  height: number
  top?: number
  shadowExtent?: number
}

export const nodeCache = new WeakMap<DOMElement, CachedLayout>()

/** Rects of removed children that need clearing on next render */
export const pendingClears = new WeakMap<DOMElement, Rectangle[]>()

/**
 * Set when a pendingClear is added for an absolute-positioned node.
 * Signals renderer to disable blit for the next frame: the removed node
 * may have painted over non-siblings (e.g. an overlay over a ScrollBox
 * earlier in tree order), so their blits from prevScreen would restore
 * the overlay's pixels. Normal-flow removals are already handled by
 * hasRemovedChild at the parent level; only absolute positioning paints
 * cross-subtree. Reset at the start of each render.
 */
let absoluteNodeRemoved = false

export function addPendingClear(parent: DOMElement, rect: Rectangle, isAbsolute: boolean): void {
  const existing = pendingClears.get(parent)
  if (existing) {
    existing.push(rect)
  } else {
    pendingClears.set(parent, [rect])
  }
  if (isAbsolute) {
    absoluteNodeRemoved = true
  }
}

export function consumeAbsoluteRemovedFlag(): boolean {
  const had = absoluteNodeRemoved
  absoluteNodeRemoved = false
  return had
}
