/**
 * Tests for the pure-TS Yoga port focused on percentage resolution
 * against the parent's CONTENT box (outer − border − padding) for
 * in-flow children. This is the canonical CSS containing-block rule
 * for in-flow elements; the comment in `layoutNode` already asserts
 * "Per CSS, a % width resolves against the parent's content-box
 * width" — these tests pin the actual code to that assertion.
 *
 * Motivating bug: shakedown B7 (issue #60). A bordered parent with a
 * `width="100%"` child resolved the child's percent against the
 * parent's OUTER width, so the child overflowed into the border zone
 * and either the child or the border ended up partially missing
 * depending on paint order. Children of bordered/padded boxes are
 * extremely common in TUIs (windows, panels, framed lists) so the
 * footgun lands hard.
 *
 * Absolute children are out of scope here — they already use the
 * parent's padding box per CSS §10.1 (`layoutAbsoluteChild` in the
 * yoga port). The tests below cover IN-FLOW children only.
 */

import { describe, expect, it } from 'vitest'
import { Edge, Node } from './index.js'

/**
 * Construct a parent Node sized to `outerWidth × outerHeight` with
 * uniform border (and optional uniform padding) on every edge, then
 * a single in-flow child. Returns both nodes for assertion.
 */
function makeParentChild({
  outerWidth,
  outerHeight,
  border = 0,
  padding = 0,
}: {
  outerWidth: number
  outerHeight: number
  border?: number
  padding?: number
}): { parent: Node; child: Node } {
  const parent = new Node()
  parent.setWidth(outerWidth)
  parent.setHeight(outerHeight)
  if (border > 0) parent.setBorder(Edge.All, border)
  if (padding > 0) parent.setPadding(Edge.All, padding)
  const child = new Node()
  parent.insertChild(child, 0)
  return { parent, child }
}

describe('yoga-layout: percent dimensions resolve against parent content box (B7 / #60)', () => {
  it('width=100% on a child of a bordered parent does NOT overflow into the border zone', () => {
    // The B7 repro. Parent outer 20, border 1 on every edge → content
    // box is 18 wide. Child width=100% must resolve to 18, not 20,
    // otherwise the child paints over the right (and bottom) border.
    const { parent, child } = makeParentChild({
      outerWidth: 20,
      outerHeight: 5,
      border: 1,
    })
    child.setWidthPercent(100)
    parent.calculateLayout(undefined, undefined)
    expect(child.getComputedWidth()).toBe(18)
    expect(child.getComputedLeft()).toBe(1) // inset by parent's left border
    // Child's right edge stays strictly inside parent's right border.
    expect(child.getComputedLeft() + child.getComputedWidth()).toBe(parent.getComputedWidth() - 1)
  })

  it('width=100% on a child of a padded parent resolves against content box too', () => {
    // Border:0, padding:2 → content width = 16. Same rule.
    const { parent, child } = makeParentChild({
      outerWidth: 20,
      outerHeight: 5,
      padding: 2,
    })
    child.setWidthPercent(100)
    parent.calculateLayout(undefined, undefined)
    expect(child.getComputedWidth()).toBe(16)
    expect(child.getComputedLeft()).toBe(2)
  })

  it('width=100% with BOTH border and padding subtracts both', () => {
    // outer 30, border 1 per edge, padding 2 per edge → inner 24.
    const { parent, child } = makeParentChild({
      outerWidth: 30,
      outerHeight: 6,
      border: 1,
      padding: 2,
    })
    child.setWidthPercent(100)
    parent.calculateLayout(undefined, undefined)
    expect(child.getComputedWidth()).toBe(24)
    expect(child.getComputedLeft()).toBe(3) // 1 border + 2 padding
  })

  it('height=100% on a column child of a bordered parent also resolves against content box', () => {
    // Vertical axis: parent outer 20×10, border 1 → content height 8.
    const { parent, child } = makeParentChild({
      outerWidth: 20,
      outerHeight: 10,
      border: 1,
    })
    child.setHeightPercent(100)
    parent.calculateLayout(undefined, undefined)
    expect(child.getComputedHeight()).toBe(8)
    expect(child.getComputedTop()).toBe(1)
  })

  it('width=50% on a bordered parent resolves to 50% of content box (not 50% of outer)', () => {
    // outer 20, border 1 → content 18. 50% of 18 = 9, not 50% of 20 = 10.
    const { parent, child } = makeParentChild({
      outerWidth: 20,
      outerHeight: 5,
      border: 1,
    })
    child.setWidthPercent(50)
    parent.calculateLayout(undefined, undefined)
    expect(child.getComputedWidth()).toBe(9)
  })

  it('unbordered, unpadded parent: width=100% still equals parent outer (no regression)', () => {
    // border=0, padding=0 → inner == outer. Pre-existing behavior must
    // hold unchanged when there's no border/padding to subtract.
    const { parent, child } = makeParentChild({
      outerWidth: 20,
      outerHeight: 5,
    })
    child.setWidthPercent(100)
    parent.calculateLayout(undefined, undefined)
    expect(child.getComputedWidth()).toBe(20)
    expect(child.getComputedLeft()).toBe(0)
  })
})
