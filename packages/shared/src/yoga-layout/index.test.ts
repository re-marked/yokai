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
import { Edge, Node, PositionType } from './index.js'

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

  // ── related size constraints — same content-box rule ────────────────

  it('minWidth=100% on a bordered child clamps to parent content box', () => {
    // Child has no explicit width but minWidth=100%. The min clamps
    // the child's natural size up to 100% of parent's content area
    // (not outer). Bordered parent width 20, border 1 → content 18.
    const { parent, child } = makeParentChild({
      outerWidth: 20,
      outerHeight: 5,
      border: 1,
    })
    child.setMinWidthPercent(100)
    parent.calculateLayout(undefined, undefined)
    expect(child.getComputedWidth()).toBe(18)
  })

  it('maxWidth=50% on a bordered child caps at half of content box', () => {
    // Parent border 1, outer 20 → content 18 → 50% = 9. With an
    // explicit child width that would otherwise stretch (e.g. 100),
    // maxWidth=50% must cap to 9, not 10.
    const { parent, child } = makeParentChild({
      outerWidth: 20,
      outerHeight: 5,
      border: 1,
    })
    child.setWidth(100)
    child.setMaxWidthPercent(50)
    parent.calculateLayout(undefined, undefined)
    expect(child.getComputedWidth()).toBe(9)
  })

  it('flexBasis=100% on a bordered row child takes the full content width', () => {
    // Single child in a row container with flexBasis=100%. Resolved
    // against parent content box (18), not outer (20).
    const parent = new Node()
    parent.setWidth(20)
    parent.setHeight(5)
    parent.setBorder(Edge.All, 1)
    parent.setFlexDirection(2 /* Row */)
    const child = new Node()
    child.setFlexBasisPercent(100)
    parent.insertChild(child, 0)
    parent.calculateLayout(undefined, undefined)
    expect(child.getComputedWidth()).toBe(18)
  })

  it('position:relative left=50% offset resolves against parent content box', () => {
    // CSS: relative offsets are percentages of the containing block.
    // For in-flow children that's the parent content box. Parent
    // outer 20, border 1 → content 18. left=50% = 9. Child sits at
    // border-left (1) + relative offset (9) = layout.left of 10.
    //
    // NOTE: per Yoga upstream convention, ALL four position edges
    // (top/right/bottom/left) resolve against ownerWidth, not against
    // ownerHeight for top/bottom. This test uses `left` to stay on
    // the width axis and keep the assertion unambiguous.
    const { parent, child } = makeParentChild({
      outerWidth: 20,
      outerHeight: 5,
      border: 1,
    })
    child.setWidth(2)
    child.setHeight(1)
    child.setPositionType(PositionType.Relative)
    child.setPositionPercent(Edge.Left, 50)
    parent.calculateLayout(undefined, undefined)
    expect(child.getComputedLeft()).toBe(10)
  })

  // ── documented deviation from Yoga upstream ─────────────────────────

  it('CHILD margin percent resolves against parent CONTENT box (deviation from upstream Yoga)', () => {
    // Upstream Yoga resolves child margin percent against ownerWidth
    // (parent outer). This port resolves against parent CONTENT box —
    // a consistent "percent on a child = fraction of available
    // space" mental model. Documented in CLAUDE.md.
    //
    // Parent outer 20, border 1 → content 18. Child margin-left=50%
    // = 50% × 18 = 9 (not 50% × 20 = 10).
    const { parent, child } = makeParentChild({
      outerWidth: 20,
      outerHeight: 5,
      border: 1,
    })
    child.setWidth(2)
    child.setMarginPercent(Edge.Left, 50)
    parent.calculateLayout(undefined, undefined)
    // layout.left = parent border (1) + resolved margin (9) = 10
    expect(child.getComputedLeft()).toBe(10)
  })

  // ── absolute children unaffected ────────────────────────────────────

  it('absolute child width=100% still resolves against parent PADDING box (CSS §10.1)', () => {
    // Absolute positioning has its own containing-block rule: the
    // padding box of the nearest positioned ancestor. The yoga port
    // handles this in layoutAbsoluteChild and the B7 fix does NOT
    // touch that path. Pin the expected behavior so a future refactor
    // can't accidentally unify the two paths.
    const parent = new Node()
    parent.setWidth(20)
    parent.setHeight(5)
    parent.setBorder(Edge.All, 1)
    parent.setPadding(Edge.All, 2)
    // padding-box = outer − border = 20 − 2 = 18
    const child = new Node()
    child.setPositionType(PositionType.Absolute)
    child.setWidthPercent(100)
    parent.insertChild(child, 0)
    parent.calculateLayout(undefined, undefined)
    expect(child.getComputedWidth()).toBe(18)
  })
})
