/**
 * App-level integration tests for press-intent classification (B8 — issue
 * #61). Exercises `handleMouseEvent` directly with a hand-built `App`-shaped
 * fixture; we don't spin up Ink because the press routing is the load-
 * bearing piece, and the routing only depends on a handful of fields on
 * the App instance (selection state, gesture flags, click-press flag,
 * multi-click bookkeeping) plus a handful of dispatched-via-props
 * callbacks (onMouseDownAt / onClickAt / onSelectionDrag / onMultiClick).
 *
 * Each scenario asserts an end-to-end behavior: which handlers fired,
 * which selection state was touched, which App-level flags are set or
 * cleared. The pure `computePressIntent` truth table lives in
 * `press-intent.test.ts` — these tests cover the wiring around it.
 */

import { describe, expect, it, vi } from 'vitest'
import type { ParsedMouse } from '../parse-keypress'
import { type SelectionState, createSelectionState } from '../selection.js'
import type App from './App.js'
import { handleMouseEvent } from './App.js'

// ── fixture ─────────────────────────────────────────────────────────

type AppFixture = {
  selection: SelectionState
  onClickAt: ReturnType<typeof vi.fn>
  onMouseDownAt: ReturnType<typeof vi.fn>
  onSelectionDrag: ReturnType<typeof vi.fn>
  onSelectionChange: ReturnType<typeof vi.fn>
  onMultiClick: ReturnType<typeof vi.fn>
  onHoverAt: ReturnType<typeof vi.fn>
  getHyperlinkAt: ReturnType<typeof vi.fn>
  onOpenHyperlink: ReturnType<typeof vi.fn>
  app: App
}

/**
 * Build a partial App fixture wired with vi.fn spies for every callback
 * `handleMouseEvent` consumes. Override `dispatch` to control what
 * `onMouseDownAt` returns per-test (mirrors what dispatchMouseDown
 * would have reported back).
 */
function makeFixture(opts?: {
  /** Default dispatch result returned by onMouseDownAt. */
  dispatch?: {
    gesture: null | { handlers: object; tentative: boolean; sourceNode: null }
    clickable: boolean
  }
  /** True if onClickAt should report it consumed the click. */
  clickHandled?: boolean
}): AppFixture {
  const selection = createSelectionState()
  const dispatch = opts?.dispatch ?? { gesture: null, clickable: false }
  const onClickAt = vi.fn().mockReturnValue(opts?.clickHandled ?? false)
  const onMouseDownAt = vi.fn().mockReturnValue(dispatch)
  const onSelectionDrag = vi.fn()
  const onSelectionChange = vi.fn()
  const onMultiClick = vi.fn()
  const onHoverAt = vi.fn()
  const getHyperlinkAt = vi.fn().mockReturnValue(undefined)
  const onOpenHyperlink = vi.fn()
  const app = {
    props: {
      selection,
      onClickAt,
      onMouseDownAt,
      onSelectionDrag,
      onSelectionChange,
      onMultiClick,
      onHoverAt,
      getHyperlinkAt,
      onOpenHyperlink,
    },
    activeGesture: null,
    activeGestureTentative: false,
    activeGestureSource: null,
    pressIntentClick: false,
    lastHoverCol: -1,
    lastHoverRow: -1,
    lastClickTime: 0,
    lastClickCol: -1,
    lastClickRow: -1,
    clickCount: 0,
    pendingHyperlinkTimer: null,
  } as unknown as App
  return {
    selection,
    onClickAt,
    onMouseDownAt,
    onSelectionDrag,
    onSelectionChange,
    onMultiClick,
    onHoverAt,
    getHyperlinkAt,
    onOpenHyperlink,
    app,
  }
}

/** Build a left-button press at (col, row) with optional modifier bits. */
function press(col: number, row: number, button = 0): ParsedMouse {
  return { kind: 'mouse', action: 'press', col, row, button, sequence: '' }
}

/** Build a left-button drag-motion (motion bit 0x20) at (col, row). */
function drag(col: number, row: number): ParsedMouse {
  return { kind: 'mouse', action: 'press', col, row, button: 0x20, sequence: '' }
}

/** Build a left-button release at (col, row). */
function release(col: number, row: number, button = 0): ParsedMouse {
  return { kind: 'mouse', action: 'release', col, row, button, sequence: '' }
}

// ── tests ───────────────────────────────────────────────────────────

describe('handleMouseEvent — click intent (B8 / #61)', () => {
  it('press over a clickable Box does NOT start selection', () => {
    // The B8 repro: a Box with onClick and no onMouseDown / no
    // captureGesture call. Pre-fix, this would startSelection(anchor)
    // and any motion would set focus → hasSelection → click swallowed.
    const f = makeFixture({ dispatch: { gesture: null, clickable: true } })
    handleMouseEvent(f.app, press(5, 3))
    expect(f.selection.anchor).toBeNull()
    expect(f.selection.isDragging).toBe(false)
    expect((f.app as unknown as { pressIntentClick: boolean }).pressIntentClick).toBe(true)
    expect(f.onSelectionChange).not.toHaveBeenCalled()
  })

  it('press → motion → release on a clickable fires onClickAt exactly once and no selection', () => {
    const f = makeFixture({ dispatch: { gesture: null, clickable: true } })
    handleMouseEvent(f.app, press(5, 3))
    // Motion mid-press: pre-fix this would have set selection.focus
    // and turned the click into a 1-cell selection drag. Now it's a
    // no-op because pressIntentClick is set.
    handleMouseEvent(f.app, drag(6, 3))
    handleMouseEvent(f.app, drag(7, 4))
    handleMouseEvent(f.app, release(7, 4))
    expect(f.onSelectionDrag).not.toHaveBeenCalled()
    expect(f.selection.focus).toBeNull()
    expect(f.onClickAt).toHaveBeenCalledTimes(1)
    // 0-indexed coords (terminal 7,4 → screen 6,3)
    expect(f.onClickAt).toHaveBeenCalledWith(6, 3)
    // Flag cleared on release.
    expect((f.app as unknown as { pressIntentClick: boolean }).pressIntentClick).toBe(false)
  })

  it('press → release on a clickable WITHOUT motion fires onClickAt at the release coords', () => {
    const f = makeFixture({ dispatch: { gesture: null, clickable: true } })
    handleMouseEvent(f.app, press(5, 3))
    handleMouseEvent(f.app, release(5, 3))
    expect(f.onClickAt).toHaveBeenCalledTimes(1)
    expect(f.onClickAt).toHaveBeenCalledWith(4, 2)
    expect(f.selection.anchor).toBeNull()
  })

  it('Shift-press over a clickable demotes intent to select (force-select escape hatch)', () => {
    // Shift bit 0x04 set on the press button. The user is asking for
    // text selection over a clickable region — Button label, link
    // anchor text. Selection starts as if no onClick existed.
    const f = makeFixture({ dispatch: { gesture: null, clickable: true } })
    handleMouseEvent(f.app, press(5, 3, 0x04))
    expect(f.selection.anchor).toEqual({ col: 4, row: 2 }) // 1-indexed → 0-indexed
    expect(f.selection.isDragging).toBe(true)
    expect((f.app as unknown as { pressIntentClick: boolean }).pressIntentClick).toBe(false)
  })

  it('Alt-press over a clickable also demotes to select (xterm force-select convention)', () => {
    // Alt bit 0x08 — same escape hatch as Shift. Mirrors xterm's
    // macOptionClickForcesSelection convention already wired to
    // selection.lastPressHadAlt.
    const f = makeFixture({ dispatch: { gesture: null, clickable: true } })
    handleMouseEvent(f.app, press(5, 3, 0x08))
    expect(f.selection.anchor).toEqual({ col: 4, row: 2 })
    expect(f.selection.isDragging).toBe(true)
    expect(f.selection.lastPressHadAlt).toBe(true)
  })

  it('multiple click-intent presses do not escalate to onMultiClick', () => {
    // Two fast presses on a Button each fire onClick — they don't
    // double-click into word-select. clickCount stays 0.
    const f = makeFixture({ dispatch: { gesture: null, clickable: true } })
    handleMouseEvent(f.app, press(5, 3))
    handleMouseEvent(f.app, release(5, 3))
    handleMouseEvent(f.app, press(5, 3))
    handleMouseEvent(f.app, release(5, 3))
    expect(f.onClickAt).toHaveBeenCalledTimes(2)
    expect(f.onMultiClick).not.toHaveBeenCalled()
  })

  it('FOCUS_OUT-equivalent cleanup clears pressIntentClick mid-press', () => {
    // We can't trigger a real FOCUS_OUT here (it lives in the parser
    // path, not handleMouseEvent), but the no-button-motion lost-
    // release recovery hits the same cleanup. Simulate cursor returns
    // with no button held while a click intent is active.
    const f = makeFixture({ dispatch: { gesture: null, clickable: true } })
    handleMouseEvent(f.app, press(5, 3))
    expect((f.app as unknown as { pressIntentClick: boolean }).pressIntentClick).toBe(true)
    // Mode-1003 motion with no button held: button=3 (no button)
    // plus motion bit 0x20 = button & 0x20 set, baseButton = 3.
    handleMouseEvent(f.app, {
      kind: 'mouse',
      action: 'press',
      col: 9,
      row: 5,
      button: 0x20 | 3,
      sequence: '',
    })
    expect((f.app as unknown as { pressIntentClick: boolean }).pressIntentClick).toBe(false)
    expect(f.onClickAt).not.toHaveBeenCalled()
  })

  it('hyperlink fallback fires when onClickAt does not consume the click', () => {
    // OSC 8 link inside a clickable region: the DOM click handler
    // didn't consume (returned false), so the press-intent release
    // path should still fall through to getHyperlinkAt + the deferred
    // openHyperlink timer, mirroring the select-intent release path.
    vi.useFakeTimers()
    try {
      const f = makeFixture({ dispatch: { gesture: null, clickable: true }, clickHandled: false })
      f.getHyperlinkAt.mockReturnValue('https://example.com')
      // VS Code / xterm.js own link-opening — the hyperlink path
      // intentionally skips when running there. Force the non-xterm
      // path so the test isn't environment-dependent.
      const prev = process.env.TERM_PROGRAM
      process.env.TERM_PROGRAM = 'iTerm.app'
      try {
        handleMouseEvent(f.app, press(5, 3))
        handleMouseEvent(f.app, release(5, 3))
        expect(f.onClickAt).toHaveBeenCalledTimes(1)
        expect(f.getHyperlinkAt).toHaveBeenCalledWith(4, 2)
        // openHyperlink is deferred, fires on timer
        expect(f.onOpenHyperlink).not.toHaveBeenCalled()
        vi.runAllTimers()
        expect(f.onOpenHyperlink).toHaveBeenCalledWith('https://example.com')
      } finally {
        process.env.TERM_PROGRAM = prev
      }
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('handleMouseEvent — select intent (default, regression)', () => {
  it('press over a non-clickable starts selection (existing behavior preserved)', () => {
    const f = makeFixture({ dispatch: { gesture: null, clickable: false } })
    handleMouseEvent(f.app, press(5, 3))
    expect(f.selection.anchor).toEqual({ col: 4, row: 2 })
    expect(f.selection.isDragging).toBe(true)
    expect((f.app as unknown as { pressIntentClick: boolean }).pressIntentClick).toBe(false)
  })

  it('press → motion extends selection (existing behavior preserved)', () => {
    const f = makeFixture({ dispatch: { gesture: null, clickable: false } })
    handleMouseEvent(f.app, press(5, 3))
    handleMouseEvent(f.app, drag(8, 5))
    expect(f.onSelectionDrag).toHaveBeenCalledWith(7, 4) // 1-indexed → 0-indexed
  })
})

describe('handleMouseEvent — gesture intent overrides clickable', () => {
  it('confirmed gesture short-circuits BEFORE click-intent classification', () => {
    // A Draggable-style component: onMouseDown captures gesture AND a
    // descendant has onClick. Even though clickable=true, the press is
    // a gesture-confirmed (drag) — selection is suppressed and click-
    // intent is NOT set (release fires onUp, not onClickAt).
    const onUp = vi.fn()
    const f = makeFixture({
      dispatch: {
        gesture: { handlers: { onUp }, tentative: false, sourceNode: null },
        clickable: true,
      },
    })
    handleMouseEvent(f.app, press(5, 3))
    expect((f.app as unknown as { pressIntentClick: boolean }).pressIntentClick).toBe(false)
    expect(f.selection.anchor).toBeNull()
    handleMouseEvent(f.app, release(5, 3))
    expect(onUp).toHaveBeenCalledTimes(1)
    expect(f.onClickAt).not.toHaveBeenCalled()
  })

  it('tentative gesture also overrides clickable; release-without-motion still fires click via existing path', () => {
    // Tentative gesture goes through the existing fall-through to
    // selection-start + multi-click path (so click-on-release works).
    // pressIntentClick is NOT set; click dispatch on release goes
    // through the existing `!hasSelection && sel.anchor` branch.
    const f = makeFixture({
      dispatch: {
        gesture: { handlers: {}, tentative: true, sourceNode: null },
        clickable: true,
      },
    })
    handleMouseEvent(f.app, press(5, 3))
    expect((f.app as unknown as { pressIntentClick: boolean }).pressIntentClick).toBe(false)
    expect(f.selection.anchor).toEqual({ col: 4, row: 2 })
    handleMouseEvent(f.app, release(5, 3))
    expect(f.onClickAt).toHaveBeenCalledTimes(1)
  })
})
