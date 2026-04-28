import { createContext } from 'react'

export type ClipboardContextValue = {
  /**
   * Write text to the system clipboard. Fire-and-forget: returns
   * immediately while the write progresses asynchronously through up
   * to three paths (native utility on local sessions, tmux load-buffer
   * inside tmux, OSC 52 to the terminal). At least the native path
   * fires synchronously inside the underlying helper, so local
   * Ctrl+V usually works the moment this returns.
   *
   * No error surface for v1 — clipboard writes silently fail if every
   * path is unavailable (rare; you'd need no native utility AND no
   * tmux AND no OSC-52-capable terminal). When clipboard read lands
   * we'll grow the API to `{ copy, read }`.
   */
  copy: (text: string) => void
}

const ClipboardContext = createContext<ClipboardContextValue | null>(null)
ClipboardContext.displayName = 'InternalClipboardContext'

export default ClipboardContext
