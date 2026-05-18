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
 * `null` when the cursor isn't over any Window (over a sidebar, over
 * the terminal background, or off-terminal). Wheel handlers in that
 * case fall through to global handlers — same back-compat shape as
 * WindowFocusContext.
 *
 * Populated by App's per-frame hit-test in `app.tsx`. Each Window
 * subscribes to "am I the cursor-over window?" via the value — same
 * pattern as WindowFocusContext.
 */
export const CursorOverWindowContext = createContext<CursorOverWindowValue>(null)
