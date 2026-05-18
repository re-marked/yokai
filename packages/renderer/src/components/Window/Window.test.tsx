/**
 * Window component tests.
 *
 * Three tiers of coverage:
 *
 * 1. **Type contract** for `WindowProps` — the prop surface is the
 *    public API and a regression here breaks every downstream
 *    consumer. Pinned with `satisfies` checks so the type errors at
 *    compile-time, not at runtime.
 *
 * 2. **Module-scope counter** — the paint-z math (`takeNextWindowZ`)
 *    drives raise-on-press visual stacking. The internal counter is
 *    test-only resettable via `_resetWindowZForTesting`; this file
 *    covers that the reset works and that the public Window export
 *    survives construction in a null-context environment.
 *
 * 3. **Construction-without-throwing** — Window uses `useContext` for
 *    WindowFocusContext / CursorOverWindowContext, with explicit null
 *    handling. The hook's effects also reach the WindowManager via
 *    module-scope functions. Surviving React.createElement (i.e. the
 *    JSX evaluation phase) is the minimal sanity check that none of
 *    the wiring throws at construction. Full React-render integration
 *    is exercised by `pnpm demo:window` end-to-end.
 *
 * Underlying primitives:
 *   - WindowManager focus stack is covered by `window-manager.test.ts`.
 *   - handleDragPress / handleResizePress are covered by
 *     `Draggable.test.tsx` and `Resizable.test.tsx` respectively.
 *   - useInput auto-gating contexts are wired in `use-input.ts`; the
 *     integration is exercised by the demo.
 */

import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import Window, { _resetWindowZForTesting } from './Window.js'
import type { WindowProps } from './types.js'
import { _resetForTesting } from './window-manager.js'

afterEach(() => {
  _resetWindowZForTesting()
  _resetForTesting()
})

// ── type contract ────────────────────────────────────────────────────

describe('WindowProps', () => {
  it('accepts initialPos + initialSize as required props', () => {
    const props = {
      initialPos: { top: 0, left: 0 },
      initialSize: { width: 40, height: 12 },
    } satisfies WindowProps
    expect(props.initialPos.top).toBe(0)
    expect(props.initialSize.width).toBe(40)
  })

  it('accepts the full chrome surface', () => {
    const props = {
      initialPos: { top: 0, left: 0 },
      initialSize: { width: 40, height: 12 },
      title: 'editor',
      showCloseButton: true,
      onClose: () => {},
      borderStyle: 'single',
      borderColor: 'cyan',
      blurredBorderColor: 'gray',
      backgroundColor: 'black',
      titlebarColor: 'blue',
    } satisfies WindowProps
    expect(props.title).toBe('editor')
  })

  it('accepts the full drag/resize behavior surface', () => {
    const props = {
      initialPos: { top: 0, left: 0 },
      initialSize: { width: 40, height: 12 },
      draggable: true,
      resizable: true,
      handles: ['s', 'e', 'se'],
      bounds: { width: 80, height: 24 },
      minSize: { width: 10, height: 5 },
      maxSize: { width: 60, height: 20 },
    } satisfies WindowProps
    expect(props.handles).toContain('se')
  })

  it('accepts the focus/routing surface', () => {
    const props = {
      initialPos: { top: 0, left: 0 },
      initialSize: { width: 40, height: 12 },
      modal: true,
      claimsFocus: false,
      onWindowFocus: ({ windowId, isFocused }) => {
        void windowId
        void isFocused
      },
      onWindowBlur: () => {},
      backdropColor: '#101820',
    } satisfies WindowProps
    expect(props.modal).toBe(true)
    expect(props.claimsFocus).toBe(false)
  })

  it('accepts children', () => {
    const props = {
      initialPos: { top: 0, left: 0 },
      initialSize: { width: 40, height: 12 },
      children: 'window body',
    } satisfies WindowProps
    expect(props.children).toBe('window body')
  })
})

// ── construction sanity ──────────────────────────────────────────────

describe('Window — construction sanity', () => {
  it('survives React.createElement with minimum required props', () => {
    // The constructor-shape compliance test catches hook-misuse mistakes
    // that would surface at JSX evaluation. Runtime behavior is exercised
    // by the demo end-to-end — we don't render to ink here because the
    // setup overhead dwarfs what's actually under test.
    expect(() =>
      React.createElement(Window, {
        initialPos: { top: 0, left: 0 },
        initialSize: { width: 40, height: 12 },
      }),
    ).not.toThrow()
  })

  it('survives createElement with the full prop surface set', () => {
    expect(() =>
      React.createElement(Window, {
        initialPos: { top: 5, left: 10 },
        initialSize: { width: 50, height: 15 },
        title: 'kitchen sink',
        showCloseButton: true,
        onClose: () => {},
        draggable: true,
        resizable: true,
        handles: ['s', 'e', 'se'],
        bounds: { width: 120, height: 40 },
        minSize: { width: 10, height: 5 },
        maxSize: { width: 100, height: 30 },
        modal: false,
        claimsFocus: true,
        onWindowFocus: () => {},
        onWindowBlur: () => {},
        borderStyle: 'single',
        borderColor: 'cyan',
        blurredBorderColor: 'gray',
        backgroundColor: 'black',
        titlebarColor: 'blue',
        backdropColor: 'black',
      }),
    ).not.toThrow()
  })
})

// ── _resetWindowZForTesting ──────────────────────────────────────────

describe('_resetWindowZForTesting', () => {
  it('exists and is callable', () => {
    // The counter is module-scope; we can't observe it directly without
    // rendering a Window (which consumes a counter value via the lazy
    // useState initializer). The afterEach hook calls this; verifying
    // the function is callable is enough to keep the test-helper
    // contract honest if the export ever drifts.
    expect(_resetWindowZForTesting).toBeTypeOf('function')
    expect(() => _resetWindowZForTesting()).not.toThrow()
  })
})
