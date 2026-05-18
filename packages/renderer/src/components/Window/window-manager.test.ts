/**
 * WindowManager tests.
 *
 * The manager is the source of truth for window-level focus — register,
 * claim, unregister, plus the modal-barrier rule that makes modals
 * stack above non-modals regardless of press order. It's pure TS with
 * no React surface, so this file drives it directly with stub windowIds
 * (symbols) and asserts the focus / subscription contract end-to-end.
 *
 * The React shell (Window.tsx) is the thin wiring layer that lives on
 * top of this — for that side of the contract, see Window.test.tsx.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WindowId } from './types.js'
import {
  _getStackForTesting,
  _resetForTesting,
  claimWindowFocus,
  getFocusedWindowId,
  isWindowFocused,
  registerWindow,
  subscribe,
  subscribeWindow,
  unregisterWindow,
} from './window-manager.js'

afterEach(() => {
  _resetForTesting()
})

// ── helpers ──────────────────────────────────────────────────────────

function id(label: string): WindowId {
  return Symbol(label)
}

// ── register / unregister lifecycle ──────────────────────────────────

describe('registerWindow', () => {
  it('pushes the window onto the stack', () => {
    const a = id('a')
    registerWindow(a, false, true)
    expect(_getStackForTesting()).toHaveLength(1)
    expect(_getStackForTesting()[0]?.id).toBe(a)
  })

  it('claims focus immediately when claimsFocus=true (default)', () => {
    const a = id('a')
    registerWindow(a, false, true)
    expect(isWindowFocused(a)).toBe(true)
  })

  it('claims focus immediately when modal=true regardless of claimsFocus', () => {
    const a = id('a')
    registerWindow(a, true, false)
    expect(isWindowFocused(a)).toBe(true)
  })

  it('does NOT claim focus when claimsFocus=false and modal=false (panel)', () => {
    const a = id('a')
    registerWindow(a, false, false)
    // Stack contains the window but it's not focused — getFocusedWindowId
    // returns this id because it's the only one mounted (no peers to lose
    // focus to). The "doesn't claim" semantic matters when a peer is
    // ALREADY focused.
    const b = id('b')
    registerWindow(b, false, true) // b mounts focused
    expect(isWindowFocused(b)).toBe(true)
    // Now register a panel — it doesn't steal focus from b.
    const c = id('c')
    registerWindow(c, false, false)
    expect(isWindowFocused(b)).toBe(true)
    expect(isWindowFocused(c)).toBe(false)
  })

  it('returns a cleanup function that unregisters', () => {
    const a = id('a')
    const cleanup = registerWindow(a, false, true)
    expect(_getStackForTesting()).toHaveLength(1)
    cleanup()
    expect(_getStackForTesting()).toHaveLength(0)
  })

  it('is defensive against duplicate registration (no double-stacking)', () => {
    const a = id('a')
    registerWindow(a, false, true)
    registerWindow(a, false, true)
    expect(_getStackForTesting()).toHaveLength(1)
  })

  it('newly-mounted focused window takes focus from existing focused peer', () => {
    const a = id('a')
    const b = id('b')
    registerWindow(a, false, true)
    expect(isWindowFocused(a)).toBe(true)
    registerWindow(b, false, true)
    expect(isWindowFocused(a)).toBe(false)
    expect(isWindowFocused(b)).toBe(true)
  })
})

describe('unregisterWindow', () => {
  it('removes the window from the stack', () => {
    const a = id('a')
    registerWindow(a, false, true)
    unregisterWindow(a)
    expect(_getStackForTesting()).toHaveLength(0)
  })

  it('is a no-op for an unregistered id', () => {
    const a = id('a')
    expect(() => unregisterWindow(a)).not.toThrow()
    expect(_getStackForTesting()).toHaveLength(0)
  })

  it('shifts focus to the next-highest-z eligible window when the focused one unmounts', () => {
    const a = id('a')
    const b = id('b')
    const c = id('c')
    registerWindow(a, false, true)
    registerWindow(b, false, true) // b focused now
    registerWindow(c, false, true) // c focused now
    expect(isWindowFocused(c)).toBe(true)
    unregisterWindow(c)
    // Next-highest-z is b (mounted after a, so higher z).
    expect(isWindowFocused(b)).toBe(true)
  })

  it('leaves no focus when the last window unmounts', () => {
    const a = id('a')
    registerWindow(a, false, true)
    unregisterWindow(a)
    expect(getFocusedWindowId()).toBeNull()
  })
})

// ── claimWindowFocus / press handling ────────────────────────────────

describe('claimWindowFocus', () => {
  it('promotes the claimed window to focused', () => {
    const a = id('a')
    const b = id('b')
    registerWindow(a, false, true)
    registerWindow(b, false, true) // b focused
    claimWindowFocus(a)
    expect(isWindowFocused(a)).toBe(true)
    expect(isWindowFocused(b)).toBe(false)
  })

  it('is a no-op for an unregistered id', () => {
    const a = id('a')
    expect(() => claimWindowFocus(a)).not.toThrow()
    expect(getFocusedWindowId()).toBeNull()
  })

  it('repeated claims on the same focused window keep it focused', () => {
    const a = id('a')
    registerWindow(a, false, true)
    claimWindowFocus(a)
    claimWindowFocus(a)
    expect(isWindowFocused(a)).toBe(true)
  })
})

// ── modal-barrier rule ───────────────────────────────────────────────

describe('modal-barrier rule', () => {
  it('topmost modal wins focus even if a non-modal was pressed later', () => {
    const m = id('modal')
    const a = id('a')
    registerWindow(a, false, true)
    registerWindow(m, true, true) // modal focused
    expect(isWindowFocused(m)).toBe(true)
    // Press the non-modal — z bumps but focus stays on modal.
    claimWindowFocus(a)
    expect(isWindowFocused(m)).toBe(true)
    expect(isWindowFocused(a)).toBe(false)
  })

  it('topmost-by-z modal wins among peer modals', () => {
    const m1 = id('m1')
    const m2 = id('m2')
    registerWindow(m1, true, true) // m1 focused
    registerWindow(m2, true, true) // m2 focused (mounted after, higher z)
    expect(isWindowFocused(m2)).toBe(true)
    // Press m1 — its z bumps, becomes topmost modal.
    claimWindowFocus(m1)
    expect(isWindowFocused(m1)).toBe(true)
    expect(isWindowFocused(m2)).toBe(false)
  })

  it('focus shifts to next-highest non-modal when the modal unmounts', () => {
    const a = id('a')
    const m = id('m')
    registerWindow(a, false, true)
    registerWindow(m, true, true)
    expect(isWindowFocused(m)).toBe(true)
    unregisterWindow(m)
    // No modal left → focus falls to next-highest non-modal.
    expect(isWindowFocused(a)).toBe(true)
  })

  it('pressed non-modal under modal becomes focused once modal closes', () => {
    const a = id('a')
    const b = id('b')
    const m = id('m')
    registerWindow(a, false, true)
    registerWindow(b, false, true) // b on top of a
    registerWindow(m, true, true) // modal focused, b queued
    claimWindowFocus(a) // press a (bumps a's z); modal still on top
    expect(isWindowFocused(m)).toBe(true)
    unregisterWindow(m)
    // After modal closes, a's z is highest among non-modals.
    expect(isWindowFocused(a)).toBe(true)
  })
})

// ── getFocusedWindowId on edge cases ─────────────────────────────────

describe('getFocusedWindowId', () => {
  it('returns null on empty stack', () => {
    expect(getFocusedWindowId()).toBeNull()
  })

  it('returns the only mounted window when it is the sole entry', () => {
    const a = id('a')
    registerWindow(a, false, true)
    expect(getFocusedWindowId()).toBe(a)
  })

  it('returns the only modal when one exists, regardless of non-modal stack', () => {
    const a = id('a')
    const b = id('b')
    const c = id('c')
    const m = id('m')
    registerWindow(a, false, true)
    registerWindow(b, false, true)
    registerWindow(c, false, true)
    registerWindow(m, true, true)
    expect(getFocusedWindowId()).toBe(m)
  })
})

// ── subscription / notification ──────────────────────────────────────

describe('subscribeWindow', () => {
  it('fires the listener when the window transitions blurred → focused', () => {
    const a = id('a')
    const b = id('b')
    const listener = vi.fn<(focused: boolean) => void>()
    registerWindow(a, false, true) // a focused
    registerWindow(b, false, true) // b focused, a blurred
    subscribeWindow(a, listener)
    claimWindowFocus(a) // a refocused
    expect(listener).toHaveBeenCalledWith(true)
  })

  it('fires the listener when the window transitions focused → blurred', () => {
    const a = id('a')
    const listener = vi.fn<(focused: boolean) => void>()
    registerWindow(a, false, true)
    subscribeWindow(a, listener)
    const b = id('b')
    registerWindow(b, false, true) // a loses focus
    expect(listener).toHaveBeenCalledWith(false)
  })

  it('does NOT fire for unrelated stack changes', () => {
    const a = id('a')
    const b = id('b')
    const listener = vi.fn<(focused: boolean) => void>()
    registerWindow(a, false, true) // a focused
    subscribeWindow(a, listener)
    // b mounts unfocused (panel) — no effect on a.
    registerWindow(b, false, false)
    expect(listener).not.toHaveBeenCalled()
  })

  it('returns an unsubscribe function that stops further notifications', () => {
    const a = id('a')
    const b = id('b')
    const listener = vi.fn<(focused: boolean) => void>()
    registerWindow(a, false, true)
    const unsubscribe = subscribeWindow(a, listener)
    unsubscribe()
    registerWindow(b, false, true) // a loses focus — listener should NOT fire
    expect(listener).not.toHaveBeenCalled()
  })

  it('supports multiple subscribers per window', () => {
    const a = id('a')
    const l1 = vi.fn<(focused: boolean) => void>()
    const l2 = vi.fn<(focused: boolean) => void>()
    registerWindow(a, false, true)
    subscribeWindow(a, l1)
    subscribeWindow(a, l2)
    const b = id('b')
    registerWindow(b, false, true)
    expect(l1).toHaveBeenCalledWith(false)
    expect(l2).toHaveBeenCalledWith(false)
  })

  it('iterates a snapshot so a listener that unsubscribes during dispatch does not perturb others', () => {
    const a = id('a')
    registerWindow(a, false, true)
    // l1 unsubscribes itself inside its callback; l2 must still fire.
    const l2 = vi.fn<(focused: boolean) => void>()
    // Closure-captured ref so l1 can reach its own unsubscribe — the
    // ref slot is the only mutation site (lint dislikes single-assigned
    // `let`), so this stays a const with a mutable holder.
    const holder: { unsub: (() => void) | undefined } = { unsub: undefined }
    const l1 = vi.fn(() => {
      holder.unsub?.()
    })
    holder.unsub = subscribeWindow(a, l1)
    subscribeWindow(a, l2)
    const b = id('b')
    registerWindow(b, false, true) // triggers both listeners with false
    expect(l1).toHaveBeenCalledWith(false)
    expect(l2).toHaveBeenCalledWith(false)
  })
})

describe('subscribe (manager-wide)', () => {
  it('fires on every focus-stack change', () => {
    const listener = vi.fn<() => void>()
    subscribe(listener)
    const a = id('a')
    registerWindow(a, false, true)
    expect(listener).toHaveBeenCalled()
  })

  it('returns an unsubscribe function', () => {
    const listener = vi.fn<() => void>()
    const unsubscribe = subscribe(listener)
    unsubscribe()
    const a = id('a')
    registerWindow(a, false, true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('fires for non-focus-changing register too (panel mount)', () => {
    const a = id('a')
    registerWindow(a, false, true) // a focused
    const listener = vi.fn<() => void>()
    subscribe(listener)
    const b = id('b')
    registerWindow(b, false, false) // panel, doesn't change focus
    expect(listener).toHaveBeenCalled()
  })
})

// ── _resetForTesting ─────────────────────────────────────────────────

describe('_resetForTesting', () => {
  it('clears stack, subscribers, and counter', () => {
    const a = id('a')
    registerWindow(a, false, true)
    const listener = vi.fn<(focused: boolean) => void>()
    subscribeWindow(a, listener)
    _resetForTesting()
    expect(_getStackForTesting()).toHaveLength(0)
    expect(getFocusedWindowId()).toBeNull()
    // Re-register and confirm subscriber is gone (it would have fired
    // when claimed; if cleared, no fire).
    registerWindow(a, false, true)
    expect(listener).not.toHaveBeenCalled()
  })
})
