import { useContext } from 'react'
import ClipboardContext, { type ClipboardContextValue } from '../components/ClipboardContext.js'

const NOOP_CLIPBOARD: ClipboardContextValue = {
  copy: () => {},
}

/**
 * Access the system clipboard from inside a React component.
 *
 * Returns `{ copy(text) }` — fire-and-forget write that goes through
 * the renderer's three-path clipboard helper (native utility, tmux
 * load-buffer, OSC 52). See `termio/osc.ts > setClipboard` for the
 * exact path resolution.
 *
 * When called outside an `<App>` (e.g. unit tests that mount a
 * subtree without going through `render`), returns a no-op so test
 * code doesn't have to wrap every fragment in a clipboard provider.
 *
 * @example
 *   const { copy } = useClipboard()
 *   copy('text to clipboard')
 */
export function useClipboard(): ClipboardContextValue {
  const ctx = useContext(ClipboardContext)
  return ctx ?? NOOP_CLIPBOARD
}

export default useClipboard
