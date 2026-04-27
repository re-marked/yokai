import type React from 'react'
import { type PropsWithChildren, useContext, useEffect, useInsertionEffect } from 'react'
import instances from '../instances.js'
import {
  DISABLE_MOUSE_TRACKING,
  ENABLE_MOUSE_TRACKING,
  ENTER_ALT_SCREEN,
  EXIT_ALT_SCREEN,
} from '../termio/dec.js'
import { TerminalWriteContext } from '../useTerminalNotification.js'
import Box from './Box.js'
import PasteContext from './PasteContext.js'
import { TerminalSizeContext } from './TerminalSizeContext.js'

type Props = PropsWithChildren<{
  /** Enable SGR mouse tracking (wheel + click/drag). Default true. */
  mouseTracking?: boolean
  /**
   * Smart-paste threshold in characters. Bracketed pastes ≤ this length
   * are dispatched as per-character keypresses (so short pastes feel
   * like typing). Pastes above fire a single `PasteEvent` so consumers
   * can treat them as one atomic edit. Default 32.
   *
   * Set this higher (e.g. 200) when most expected pastes are URLs or
   * single-line snippets and you want them to feel like typing rather
   * than a discrete paste action. Set lower (e.g. 4) when even tiny
   * paste blocks should fire `onPaste`.
   */
  pasteThreshold?: number
}>

/**
 * Run children in the terminal's alternate screen buffer, constrained to
 * the viewport height. While mounted:
 *
 * - Enters the alt screen (DEC 1049), clears it, homes the cursor
 * - Constrains its own height to the terminal row count, so overflow must
 *   be handled via `overflow: scroll` / flexbox (no native scrollback)
 * - Optionally enables SGR mouse tracking (wheel + click/drag) — events
 *   surface as `ParsedKey` (wheel) and update the Ink instance's
 *   selection state (click/drag)
 *
 * On unmount, disables mouse tracking and exits the alt screen, restoring
 * the main screen's content. Safe for use in ctrl-o transcript overlays
 * and similar temporary fullscreen views — the main screen is preserved.
 *
 * Notifies the Ink instance via `setAltScreenActive()` so the renderer
 * keeps the cursor inside the viewport (preventing the cursor-restore LF
 * from scrolling content) and so signal-exit cleanup can exit the alt
 * screen if the component's own unmount doesn't run.
 */
export function AlternateScreen({
  children,
  mouseTracking = true,
  pasteThreshold,
}: Props): React.ReactNode {
  const size = useContext(TerminalSizeContext)
  const writeRaw = useContext(TerminalWriteContext)
  const paste = useContext(PasteContext)

  // Push the pasteThreshold to the App's instance field whenever it
  // changes. App reads the field at parse time (outside React) so the
  // simplest plumbing is a setter on context that mutates the field.
  // Skipping the effect when pasteThreshold is undefined leaves App's
  // own default in place.
  useEffect(() => {
    if (pasteThreshold === undefined) return
    paste?.setPasteThreshold(pasteThreshold)
  }, [paste, pasteThreshold])

  // useInsertionEffect (not useLayoutEffect): react-reconciler calls
  // resetAfterCommit between the mutation and layout commit phases, and
  // Ink's resetAfterCommit triggers onRender. With useLayoutEffect, that
  // first onRender fires BEFORE this effect — writing a full frame to the
  // main screen with altScreen=false. That frame is preserved when we
  // enter alt screen and revealed on exit as a broken view. Insertion
  // effects fire during the mutation phase, before resetAfterCommit, so
  // ENTER_ALT_SCREEN reaches the terminal before the first frame does.
  // Cleanup timing is unchanged: both insertion and layout effect cleanup
  // run in the mutation phase on unmount, before resetAfterCommit.
  useInsertionEffect(() => {
    const ink = instances.get(process.stdout)
    if (!writeRaw) return

    writeRaw(`${ENTER_ALT_SCREEN}\x1b[2J\x1b[H${mouseTracking ? ENABLE_MOUSE_TRACKING : ''}`)
    ink?.setAltScreenActive(true, mouseTracking)

    return () => {
      ink?.setAltScreenActive(false)
      ink?.clearTextSelection()
      writeRaw((mouseTracking ? DISABLE_MOUSE_TRACKING : '') + EXIT_ALT_SCREEN)
    }
  }, [writeRaw, mouseTracking])

  return (
    <Box flexDirection="column" height={size?.rows ?? 24} width="100%" flexShrink={0}>
      {children}
    </Box>
  )
}
