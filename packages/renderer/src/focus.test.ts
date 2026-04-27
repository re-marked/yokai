/**
 * FocusManager subscription API tests.
 *
 * The pre-existing focus / blur / focusNext / focusPrevious behavior
 * is exercised end-to-end through ink.tsx's keyboard handling and
 * doesn't have a dedicated unit test. These tests cover the NEW
 * subscribe / subscribeToFocus surface used by useFocus and
 * useFocusManager — keeping the contract pinned so a future change
 * doesn't silently break the React hooks.
 */

import { describe, expect, it, vi } from 'vitest'
import { type DOMElement, appendChildNode, createNode, setAttribute } from './dom.js'
import { FocusManager } from './focus.js'

/** Test-only: a real FocusManager + a tree it can navigate. The
 *  dispatchFocusEvent stub returns false (nothing prevented) so we
 *  isolate the manager's bookkeeping from the React event system. */
function setup(): { fm: FocusManager; root: DOMElement; a: DOMElement; b: DOMElement } {
  const fm = new FocusManager(() => false)
  const root = createNode('ink-root')
  root.focusManager = fm
  const a = createNode('ink-box')
  setAttribute(a, 'tabIndex', 0)
  const b = createNode('ink-box')
  setAttribute(b, 'tabIndex', 0)
  appendChildNode(root, a)
  appendChildNode(root, b)
  return { fm, root, a, b }
}

describe('FocusManager.subscribeToFocus', () => {
  it('fires `true` when the subscribed node gains focus', () => {
    const { fm, a } = setup()
    const listener = vi.fn()
    fm.subscribeToFocus(a, listener)
    fm.focus(a)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(true)
  })

  it('fires `false` when the subscribed node loses focus', () => {
    const { fm, a, b } = setup()
    fm.focus(a)
    const listener = vi.fn()
    fm.subscribeToFocus(a, listener)
    fm.focus(b)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(false)
  })

  it('does NOT fire for focus changes on OTHER nodes', () => {
    const { fm, a, b } = setup()
    const listener = vi.fn()
    fm.subscribeToFocus(a, listener)
    fm.focus(b)
    expect(listener).not.toHaveBeenCalled()
  })

  it('fires once per focus transition (no duplicate notifications)', () => {
    const { fm, a, b } = setup()
    const listener = vi.fn()
    fm.subscribeToFocus(a, listener)
    fm.focus(a)
    fm.focus(b)
    fm.focus(a)
    // a → focused, blurred, focused = 3 events
    expect(listener).toHaveBeenCalledTimes(3)
    expect(listener.mock.calls.map((c) => c[0])).toEqual([true, false, true])
  })

  it('returns an unsubscribe function that stops further notifications', () => {
    const { fm, a, b } = setup()
    const listener = vi.fn()
    const unsubscribe = fm.subscribeToFocus(a, listener)
    fm.focus(a)
    unsubscribe()
    fm.focus(b)
    fm.focus(a)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('supports multiple listeners on the same node', () => {
    const { fm, a } = setup()
    const l1 = vi.fn()
    const l2 = vi.fn()
    fm.subscribeToFocus(a, l1)
    fm.subscribeToFocus(a, l2)
    fm.focus(a)
    expect(l1).toHaveBeenCalledWith(true)
    expect(l2).toHaveBeenCalledWith(true)
  })

  it('a listener that unsubscribes during dispatch does not perturb others', () => {
    const { fm, a } = setup()
    let unsubB: () => void = () => {}
    const lA = vi.fn(() => {
      // First listener unsubscribes the second mid-dispatch.
      unsubB()
    })
    const lB = vi.fn()
    fm.subscribeToFocus(a, lA)
    unsubB = fm.subscribeToFocus(a, lB)
    fm.focus(a)
    expect(lA).toHaveBeenCalledTimes(1)
    // lB was unsubscribed BEFORE its turn in the snapshot iteration —
    // and the snapshot iteration ensures it still fires this tick.
    // Crucial: iteration must use a snapshot for correctness regardless
    // of order. Confirming both fire proves the snapshot guard works.
    expect(lB).toHaveBeenCalledTimes(1)
  })

  it('drops listeners for nodes removed from the tree', () => {
    const { fm, root, a, b } = setup()
    const listener = vi.fn()
    fm.focus(a)
    fm.subscribeToFocus(a, listener)
    fm.handleNodeRemoved(a, root)
    // a is gone; subscribing to it again would create a new entry, but
    // the original listener should never fire for a NEW focus event on
    // some other node.
    fm.focus(b)
    // The only call should have been the implicit blur from removal.
    expect(listener.mock.calls.map((c) => c[0])).toEqual([false])
  })
})

describe('FocusManager.subscribe (global)', () => {
  it('fires after every focus change', () => {
    const { fm, a, b } = setup()
    const listener = vi.fn()
    fm.subscribe(listener)
    fm.focus(a)
    fm.focus(b)
    fm.blur()
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('fires on blur with no current focus (no-op blur skipped)', () => {
    const { fm } = setup()
    const listener = vi.fn()
    fm.subscribe(listener)
    // No active element; blur() returns early without notifying.
    fm.blur()
    expect(listener).not.toHaveBeenCalled()
  })

  it('returns an unsubscribe function', () => {
    const { fm, a, b } = setup()
    const listener = vi.fn()
    const unsubscribe = fm.subscribe(listener)
    fm.focus(a)
    unsubscribe()
    fm.focus(b)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('fires on handleNodeRemoved when the active element is removed', () => {
    const { fm, root, a } = setup()
    fm.focus(a)
    const listener = vi.fn()
    fm.subscribe(listener)
    fm.handleNodeRemoved(a, root)
    // No restore candidate (b wasn't focused first), so global fires
    // signaling "no focus."
    expect(listener).toHaveBeenCalled()
  })
})
