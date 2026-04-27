import { TerminalEvent } from './terminal-event.js'

/**
 * Paste event — fired when the user pastes text via the terminal's
 * bracketed paste mode (mode 2004) AND the pasted text is longer than
 * the configured threshold (`<AlternateScreen pasteThreshold>`,
 * default 32 characters). Below the threshold, the paste content is
 * dispatched as a stream of regular keypresses instead, so short
 * pastes feel like typing — see `App.handleParsedInput` for the split.
 *
 * `<TextInput>` listens for this event to insert long pastes as a
 * single undoable edit. Custom consumers attach `onPaste` on any
 * `<Box>` to receive the same event.
 *
 * Bubbles like `onClick` / `onKeyDown`. `event.preventDefault()`
 * marks the paste as handled — the renderer does not act on it
 * directly, but downstream consumers (e.g. an outer wrapper that
 * wants to treat un-prevented pastes as a fallback action) can read
 * `defaultPrevented`.
 */
export class PasteEvent extends TerminalEvent {
  /** The raw pasted text. May contain newlines, control characters,
   *  and ANSI sequences as the user copied them — consumers are
   *  responsible for sanitisation appropriate to their context (e.g.
   *  TextInput strips newlines in single-line mode). */
  readonly text: string

  constructor(text: string) {
    super('paste', { bubbles: true, cancelable: true })
    this.text = text
  }
}
