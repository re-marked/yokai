/**
 * React contexts for the `<Window>` primitive.
 *
 * Two contexts:
 *   - `WindowFocusContext` — populated by every Window's React shell;
 *     carries `{isFocused, windowId, modal}` for whatever Window encloses
 *     this subtree. Read by `useInput` for keyboard auto-gating, by
 *     descendants that want focus-aware rendering, and by the planned
 *     `useWindow()` introspection hook.
 *   - `CursorOverWindowContext` — populated by App per-frame from the
 *     hit-test layer; carries which Window (if any) the cursor is
 *     currently over. Read by `useInput` for the WHEEL routing rule
 *     (hover-scoped — wheel scrolls whatever the cursor is over, not
 *     whatever has focus).
 *
 * Both default to `null` outside a Window — `useInput` treats null as
 * "global mode, always active" so apps that never opt into the Window
 * primitive get exactly the pre-Window behavior (back-compat).
 *
 * No JSX here — contexts only. The `<Window>` React shell imports the
 * provider half; consumers import the value type via `types.ts`.
 */

import { createContext } from 'react'
import type { CursorOverWindowValue, WindowFocusValue } from './types.js'

/**
 * `null` when the consumer is rendered OUTSIDE any Window. `useInput`
 * checks for null first; finding `null` means "no scope to gate
 * against, fire handlers globally" — the old behavior. Finding a value
 * means "we're inside a Window; gate by isFocused unless the consumer
 * passed an explicit isActive override."
 */
export const WindowFocusContext = createContext<WindowFocusValue | null>(null)

/**
 * `null` when the consumer is rendered OUTSIDE any Window. Each
 * `<Window>` provides this context with `{ isOver: bool }` reflecting
 * whether the cursor is currently over the Window's outer rect. The
 * value updates from the Window's outer Surface mouseEnter / Leave
 * events.
 *
 * Read by `useInput` for wheel-event routing: wheel fires for the
 * consumer's handler only when the cursor is over THIS enclosing
 * Window. That matches real-OS behavior (the OS scrolls whatever is
 * under the pointer, not what has keyboard focus) while staying
 * decoupled from focus state. Non-wheel events continue to use
 * `WindowFocusContext`'s focus-scoped routing.
 */
export const CursorOverWindowContext = createContext<CursorOverWindowValue>(null)
