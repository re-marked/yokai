import { describe, expect, it } from 'vitest'
import {
  clearSelection,
  createSelectionState,
  finishSelection,
  hasSelection,
  selectionBounds,
  shiftAnchor,
  shiftSelectionForFollow,
  startSelection,
  updateSelection,
} from './selection.js'

describe('selection state machine', () => {
  describe('lifecycle', () => {
    it('starts empty', () => {
      const s = createSelectionState()
      expect(hasSelection(s)).toBe(false)
      expect(s.anchor).toBeNull()
      expect(s.focus).toBeNull()
      expect(s.isDragging).toBe(false)
    })

    it('a bare click (start without update) leaves no selection', () => {
      const s = createSelectionState()
      startSelection(s, 5, 3)
      // Anchor recorded, but focus stays null until first drag motion.
      // hasSelection requires both anchor AND focus to be set, so a
      // mouse-down + mouse-up with no motion should not highlight.
      expect(s.anchor).toEqual({ col: 5, row: 3 })
      expect(s.focus).toBeNull()
      expect(s.isDragging).toBe(true)
      expect(hasSelection(s)).toBe(false)
    })

    it('finishSelection ends drag mode but keeps the selection visible', () => {
      const s = createSelectionState()
      startSelection(s, 5, 3)
      updateSelection(s, 7, 3)
      finishSelection(s)
      expect(s.isDragging).toBe(false)
      // Anchor + focus preserved so the highlight stays on screen and
      // the text is still copyable until clearSelection() runs.
      expect(s.anchor).toEqual({ col: 5, row: 3 })
      expect(s.focus).toEqual({ col: 7, row: 3 })
      expect(hasSelection(s)).toBe(true)
    })

    it('clearSelection resets everything', () => {
      const s = createSelectionState()
      startSelection(s, 5, 3)
      updateSelection(s, 7, 5)
      clearSelection(s)
      expect(s.anchor).toBeNull()
      expect(s.focus).toBeNull()
      expect(s.isDragging).toBe(false)
      expect(hasSelection(s)).toBe(false)
    })
  })

  describe('updateSelection', () => {
    it('ignores a no-op motion at the anchor cell before any real drag', () => {
      // Mode-1002 terminals can fire a drag event at the same cell as
      // mouse-down (sub-pixel tremor). We must not turn that into a
      // 1-cell selection that would clobber the clipboard.
      const s = createSelectionState()
      startSelection(s, 5, 3)
      updateSelection(s, 5, 3)
      expect(s.focus).toBeNull()
      expect(hasSelection(s)).toBe(false)
    })

    it('sets focus on real motion away from anchor', () => {
      const s = createSelectionState()
      startSelection(s, 5, 3)
      updateSelection(s, 8, 3)
      expect(s.focus).toEqual({ col: 8, row: 3 })
      expect(hasSelection(s)).toBe(true)
    })

    it('tracks back-to-anchor motion once focus has been set', () => {
      const s = createSelectionState()
      startSelection(s, 5, 3)
      updateSelection(s, 8, 3) // first real motion
      updateSelection(s, 5, 3) // dragged back to anchor — now valid
      expect(s.focus).toEqual({ col: 5, row: 3 })
    })

    it('clears virtualFocusRow when the user moves the mouse', () => {
      // Regression guard for the drag→follow transition bug. During
      // drag-to-scroll, the dragging branch in ink.tsx populates
      // virtualFocusRow to track focus's text-relative position.
      // When the user then moves the mouse to a new screen position,
      // that text-tracking debt no longer applies and must be cleared,
      // or the next shiftSelectionForFollow will start from a stale row.
      const s = createSelectionState()
      startSelection(s, 5, 10)
      updateSelection(s, 10, 10)
      s.virtualFocusRow = 7 // simulate drag-phase tracking
      updateSelection(s, 12, 12) // user moves the mouse
      expect(s.virtualFocusRow).toBeUndefined()
      expect(s.focus).toEqual({ col: 12, row: 12 })
    })
  })

  describe('selectionBounds normalization', () => {
    it('returns null with no anchor', () => {
      const s = createSelectionState()
      expect(selectionBounds(s)).toBeNull()
    })

    it('returns anchor before focus when reading order matches', () => {
      const s = createSelectionState()
      startSelection(s, 2, 1)
      updateSelection(s, 8, 4)
      expect(selectionBounds(s)).toEqual({
        start: { col: 2, row: 1 },
        end: { col: 8, row: 4 },
      })
    })

    it('swaps anchor and focus when focus is earlier in reading order', () => {
      const s = createSelectionState()
      startSelection(s, 8, 4) // anchor low-right
      updateSelection(s, 2, 1) // dragged up-left
      // Bounds normalize so start always precedes end in reading order.
      expect(selectionBounds(s)).toEqual({
        start: { col: 2, row: 1 },
        end: { col: 8, row: 4 },
      })
    })
  })

  describe('shiftAnchor (drag-to-scroll)', () => {
    it('moves anchor by the given dRow within bounds', () => {
      const s = createSelectionState()
      startSelection(s, 5, 10)
      updateSelection(s, 8, 12)
      shiftAnchor(s, -3, 0, 22)
      expect(s.anchor).toEqual({ col: 5, row: 7 })
      // Focus stays at the mouse screen position during drag.
      expect(s.focus).toEqual({ col: 8, row: 12 })
    })

    it('clamps anchor at the top edge and records virtualAnchorRow', () => {
      const s = createSelectionState()
      startSelection(s, 5, 2)
      updateSelection(s, 8, 12)
      shiftAnchor(s, -5, 0, 22) // would go to row -3
      expect(s.anchor).toEqual({ col: 5, row: 0 })
      // Virtual row records the pre-clamp position so a reverse scroll
      // can restore the true row exactly. Without this the round-trip
      // would land at row 0 + delta instead of -3 + delta.
      expect(s.virtualAnchorRow).toBe(-3)
    })

    it('clears virtualAnchorRow when the anchor returns to in-bounds', () => {
      const s = createSelectionState()
      startSelection(s, 5, 2)
      updateSelection(s, 8, 12)
      shiftAnchor(s, -5, 0, 22) // virtualAnchorRow = -3
      shiftAnchor(s, 5, 0, 22) // back to row 2 in-bounds
      expect(s.anchor).toEqual({ col: 5, row: 2 })
      expect(s.virtualAnchorRow).toBeUndefined()
    })
  })

  describe('shiftSelectionForFollow (sticky-scroll follow)', () => {
    it('moves both endpoints by the delta', () => {
      const s = createSelectionState()
      startSelection(s, 5, 10)
      updateSelection(s, 8, 14)
      finishSelection(s)
      const cleared = shiftSelectionForFollow(s, -3, 0, 22)
      expect(cleared).toBe(false)
      expect(s.anchor).toEqual({ col: 5, row: 7 })
      expect(s.focus).toEqual({ col: 8, row: 11 })
    })

    it('returns true and clears the selection when both ends overshoot the top', () => {
      // When the selected text scrolls entirely off the viewport top,
      // the highlight has nothing to attach to. Returning true tells
      // ink.tsx to notify React-land subscribers (so the footer "copy"
      // hint disappears).
      const s = createSelectionState()
      startSelection(s, 5, 1)
      updateSelection(s, 8, 2)
      finishSelection(s)
      const cleared = shiftSelectionForFollow(s, -10, 0, 22)
      expect(cleared).toBe(true)
      expect(s.anchor).toBeNull()
      expect(s.focus).toBeNull()
    })

    it('reads virtualAnchorRow from a prior shiftAnchor (drag→follow handoff)', () => {
      // This is the actual bridge between the two scroll paths:
      //   - shiftAnchor (during drag) leaves virtualAnchorRow = pre-clamp row
      //   - shiftSelectionForFollow (after release) reads it as the
      //     starting point for the next delta, otherwise the follow
      //     starts from the clamped row and undercount accumulates.
      const s = createSelectionState()
      startSelection(s, 5, 2)
      updateSelection(s, 8, 12)
      shiftAnchor(s, -5, 0, 22) // virtualAnchorRow = -3, anchor clamped to 0
      finishSelection(s)
      // Now follow-scroll continues by -2 more.
      shiftSelectionForFollow(s, -2, 0, 22)
      // anchor's true position: -3 + -2 = -5 (still clamped to 0,
      // virtualAnchorRow updated). If virtualAnchorRow had NOT been
      // honored, anchor would have started from row 0 and gone to -2,
      // losing 3 rows of accumulated drift.
      expect(s.anchor).toEqual({ col: 5, row: 0 })
      expect(s.virtualAnchorRow).toBe(-5)
    })
  })
})
