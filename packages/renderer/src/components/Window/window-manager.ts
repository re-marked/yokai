/**
 * WindowManager — module-scope coordinator for the `<Window>` primitive's
 * focus stack. Sits alongside the existing `drag-registry.ts` /
 * `focus.ts` modules: tracks which windows are mounted, which one
 * currently owns window-level focus, and which (if any) modal windows
 * are stacked above non-modals.
 *
 * Why module-scope and not React state: focus changes fire from press
 * handlers, modal mounts, and window unmounts — none of which are happy
 * being lifted into a single parent. A module singleton lets any Window
 * raise itself without threading callbacks through every common
 * ancestor. Same justification as `drag-registry.ts` for the drag
 * coordination state.
 *
 * Subscription contract:
 *   - subscribeWindow(id, listener) — fires when THIS window's focus
 *     state changes (isFocused flips). Each Window component uses this
 *     so it re-renders only when its OWN focus changes, not when an
 *     unrelated peer is raised.
 *   - subscribe(listener) — fires after every focus stack change.
 *     Reserved for higher-level consumers (debug overlays, future
 *     `useWindowManager()` hook).
 *
 * No React imports here — keeps the module testable as plain TS and
 * mirrors how `focus.ts` and `drag-registry.ts` are layered.
 */

import type { WindowId } from './types.js'

/** Per-window record kept in the focus stack. */
type WindowEntry = {
  id: WindowId
  /**
   * True when the window was mounted with `modal=true`. Modals form a
   * barrier in the focus stack — only the topmost modal (and its
   * descendants) is focused; non-modals beneath a modal cannot reach
   * focus until the modal unmounts.
   */
  modal: boolean
  /**
   * Press counter — incremented each time the window is claimFocus'd.
   * The focused window is the one with the highest counter (subject to
   * the modal-barrier rule). This is the same idea as Draggable's
   * `persistedZ` but isolated to window-level focus.
   */
  z: number
}

/** Listener fired when a specific window's `isFocused` flips. */
type WindowListener = (isFocused: boolean) => void

/** Listener fired after every focus-stack change (any window changed
 *  focus, mounted, or unmounted). For higher-level observers. */
type ManagerListener = () => void

/**
 * Stack of mounted windows, in mount order. Most-recently-claimed-focus
 * tracked via `z`, not array order — array order is mount order, kept
 * for predictable iteration and so unmount cleanup is O(n) by id rather
 * than O(stack-depth) by z.
 */
const stack: WindowEntry[] = []

/** Per-window subscribers — keyed by id so a focus flip only notifies
 *  the affected window's React component. */
const windowSubscribers = new Map<WindowId, Set<WindowListener>>()

/** Manager-wide subscribers — fire on EVERY change. */
const managerSubscribers = new Set<ManagerListener>()

/** Monotonic counter for press-order. Bumped on each claimFocus call;
 *  the highest-z window in the stack wins (within the modal barrier). */
let nextZ = 0

// ── lifecycle ────────────────────────────────────────────────────────

/**
 * Register a freshly-mounted window. Called from Window's mount effect.
 * Modal windows claim focus immediately on mount (matches macOS / Windows
 * modal semantics). Non-modal windows claim focus on mount too by
 * default, mirroring the "freshly opened window is focused" expectation
 * — except when `claimsFocus=false` (panel windows), in which case the
 * window registers without claiming.
 *
 * Returns a cleanup function that unregisters the window. The cleanup
 * is a fresh closure each call — React stores the closure that came
 * back from the call that ran, and StrictMode dev double-invokes
 * register→cleanup→register before the real lifecycle starts, so the
 * "already registered" branch below is defensive against a degenerate
 * register-without-cleanup pattern, not the StrictMode path (which is
 * handled by the cleanup in between).
 */
export function registerWindow(id: WindowId, modal: boolean, claimsFocus: boolean): () => void {
  // Defensive guard: if a caller somehow registers the same id twice
  // without unregistering between, treat the second call as a no-op
  // rather than corrupting the stack with duplicate entries. Not the
  // StrictMode path — that path is register→cleanup→register, so the
  // second register sees an empty stack and pushes normally.
  if (stack.some((e) => e.id === id)) return () => unregisterWindow(id)
  stack.push({ id, modal, z: 0 })
  if (modal || claimsFocus) claimWindowFocus(id)
  else notifyAll()
  return () => unregisterWindow(id)
}

/**
 * Remove a window from the stack. Called from Window's unmount effect.
 * After removal the next-highest-z eligible window (per the modal-
 * barrier rule) gets focus automatically — no "no window is focused"
 * dead state when the user closes the active window.
 */
export function unregisterWindow(id: WindowId): void {
  const idx = stack.findIndex((e) => e.id === id)
  if (idx === -1) return
  const prevFocused = getFocusedWindowId()
  stack.splice(idx, 1)
  windowSubscribers.delete(id)
  const newFocused = getFocusedWindowId()
  if (prevFocused !== newFocused) {
    if (prevFocused !== null) notifyWindow(prevFocused, false)
    if (newFocused !== null) notifyWindow(newFocused, true)
  }
  notifyAll()
}

/**
 * Promote a window to focused. Called by Window's press handler
 * (raise-on-press), by modal mounts (auto-focus), and externally by
 * consumers that want to programmatically focus a window.
 *
 * Subject to the modal-barrier rule: claiming focus on a non-modal
 * window beneath a modal is silently ignored (the press still bumps `z`,
 * so the non-modal is "next in line" once the modal closes, but it
 * doesn't actually become focused while the modal is up).
 */
export function claimWindowFocus(id: WindowId): void {
  const entry = stack.find((e) => e.id === id)
  if (!entry) return
  const prevFocused = getFocusedWindowId()
  nextZ += 1
  entry.z = nextZ
  const newFocused = getFocusedWindowId()
  if (prevFocused !== newFocused) {
    if (prevFocused !== null) notifyWindow(prevFocused, false)
    if (newFocused !== null) notifyWindow(newFocused, true)
  }
  notifyAll()
}

// ── queries ──────────────────────────────────────────────────────────

/**
 * Returns the currently-focused window id, or `null` if no windows are
 * mounted. With modal(s) present: returns the topmost modal's id. With
 * no modals: returns the highest-z window's id.
 */
export function getFocusedWindowId(): WindowId | null {
  if (stack.length === 0) return null
  // Modal barrier: topmost modal wins.
  let topModal: WindowEntry | null = null
  for (const entry of stack) {
    if (entry.modal && (topModal === null || entry.z > topModal.z)) topModal = entry
  }
  if (topModal !== null) return topModal.id
  // No modals: highest z wins.
  let top = stack[0]!
  for (const entry of stack) if (entry.z > top.z) top = entry
  return top.id
}

/**
 * Is THIS window currently the focused one? Convenience wrapper used by
 * Window's render path to compute the `isFocused` prop without each
 * caller re-implementing the modal-barrier logic.
 */
export function isWindowFocused(id: WindowId): boolean {
  return getFocusedWindowId() === id
}

/**
 * Snapshot of the current stack for tests / debug overlays. Returns a
 * defensive copy — callers can mutate the result without corrupting
 * internal state.
 */
export function _getStackForTesting(): WindowEntry[] {
  return stack.map((e) => ({ ...e }))
}

// ── subscription ─────────────────────────────────────────────────────

/**
 * Subscribe to focus-flip events for a single window. Fires only when
 * THIS window's isFocused transitions — sibling promotions that don't
 * affect this window's state don't wake the listener. Used by the
 * Window component itself so each Window re-renders only on its own
 * focus changes.
 *
 * Returns the unsubscribe function. Multiple subscribers per window are
 * allowed (e.g. component + a debug overlay) — each gets its own
 * notification.
 */
export function subscribeWindow(id: WindowId, listener: WindowListener): () => void {
  let bucket = windowSubscribers.get(id)
  if (!bucket) {
    bucket = new Set()
    windowSubscribers.set(id, bucket)
  }
  bucket.add(listener)
  return () => {
    bucket?.delete(listener)
    if (bucket && bucket.size === 0) windowSubscribers.delete(id)
  }
}

/**
 * Subscribe to ANY focus-stack change. Reserved for cross-window
 * observers (debug overlays, devtools). Most consumers should use
 * `subscribeWindow` for the per-window slice.
 */
export function subscribe(listener: ManagerListener): () => void {
  managerSubscribers.add(listener)
  return () => {
    managerSubscribers.delete(listener)
  }
}

// ── internal: dispatch ───────────────────────────────────────────────

function notifyWindow(id: WindowId, isFocused: boolean): void {
  const bucket = windowSubscribers.get(id)
  if (!bucket) return
  // Iterate a snapshot so a listener that unsubscribes during dispatch
  // doesn't perturb others. Same pattern as FocusManager.
  for (const listener of [...bucket]) listener(isFocused)
}

function notifyAll(): void {
  for (const listener of [...managerSubscribers]) listener()
}

// ── test helpers ─────────────────────────────────────────────────────

/**
 * Reset all internal state. Tests only. Prod consumers never need this
 * — the module is a singleton for the process's lifetime, and React
 * unmount cleans up registrations.
 *
 * @internal
 */
export function _resetForTesting(): void {
  stack.length = 0
  windowSubscribers.clear()
  managerSubscribers.clear()
  nextZ = 0
}
