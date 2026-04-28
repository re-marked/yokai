/**
 * Pure decision helper for `<TextInput>`'s Ctrl+C / Ctrl+X handling.
 *
 * Matrix (rows = key, cols = state):
 *
 * |          | has selection      | no selection      | password + sel       | password + no sel |
 * |----------|--------------------|-------------------|----------------------|-------------------|
 * | Ctrl+C   | copy               | fall through      | fall through         | fall through      |
 * | Ctrl+X   | cut (copy+delete)  | fall through      | cut-no-copy (delete) | fall through      |
 *
 * "Fall through" = the React shell must NOT call `preventDefault()` so
 * the event propagates to App-level handlers (Ctrl+C exit, future
 * "cut whatever's focused" global binding, etc).
 *
 * Password mode keeps clipboard fully isolated — copy is suppressed
 * always, never partially. Selection-delete on Ctrl+X still happens
 * because that's normal editing (the user can already Backspace it),
 * not a clipboard exposure.
 */

import { type TextInputState, selectedText } from './state.js'

export type ClipboardKeyAction =
  /** Copy `text` to clipboard. Caller preventDefaults. */
  | { kind: 'copy'; text: string }
  /** Copy `text` AND delete the selection. Caller preventDefaults. */
  | { kind: 'cut'; text: string }
  /** Delete selection without touching clipboard (password mode).
   *  Caller preventDefaults. */
  | { kind: 'cut-no-copy' }
  /** Don't preventDefault, don't act — let App-level handlers run. */
  | { kind: 'fallthrough' }

/** Minimal key shape this helper needs. Matches `KeyboardEvent` from
 *  the renderer's event system without dragging the whole class in. */
export type ClipboardKeyInput = {
  readonly ctrl: boolean
  readonly shift: boolean
  readonly key: string
}

/**
 * Decide what a Ctrl+C / Ctrl+X press means given the current input
 * state. Returns `null` if the key isn't relevant — caller continues
 * with normal key processing. Returns one of the four cases above
 * otherwise.
 */
export function clipboardKeyAction(
  key: ClipboardKeyInput,
  state: TextInputState,
  password: boolean,
): ClipboardKeyAction | null {
  if (!key.ctrl || key.shift) return null
  if (key.key !== 'c' && key.key !== 'x') return null

  const text = selectedText(state)
  const hasSel = text.length > 0

  if (key.key === 'c') {
    // Copy only when there's a selection AND we're not in password
    // mode. Anything else → fall through so App's exit-on-Ctrl-C can
    // fire. Password mode never copies, regardless of selection.
    if (hasSel && !password) return { kind: 'copy', text }
    return { kind: 'fallthrough' }
  }

  // Ctrl+X with no selection → no-op AND no preventDefault. We
  // explicitly DON'T claim the event because we did nothing; a future
  // App-level "cut focused" binding deserves to see it.
  if (!hasSel) return { kind: 'fallthrough' }
  // Password mode + selection → still delete (normal editing),
  // skip the copy step so the password chars don't reach clipboard.
  if (password) return { kind: 'cut-no-copy' }
  return { kind: 'cut', text }
}
