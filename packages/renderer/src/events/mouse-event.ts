import { Event } from './event'

/**
 * Set of handlers a MouseDownEvent receiver can install via
 * `event.captureGesture(...)` to claim subsequent mouse-motion events
 * and the eventual release for the lifetime of one drag-style gesture.
 *
 * Once a gesture is captured:
 *   - Selection extension is suppressed for that drag (no highlight
 *     trail underneath).
 *   - All mouse-motion events route to `onMove` instead of being
 *     consumed by selection — even when the cursor leaves the bounds
 *     of the originally-pressed element.
 *   - The next mouse-release fires `onUp` and clears the capture; the
 *     normal release path (onClick, selection finish) is skipped for
 *     that release.
 *
 * A captured gesture can NOT be retargeted mid-flight — capture lasts
 * exactly from the press that installed it to the next release. This
 * matches the lifetime of a single press-drag-release sequence and
 * mirrors web `pointerdown` + `setPointerCapture`.
 */
export type GestureHandlers = {
  onMove?: (event: MouseMoveEvent) => void
  onUp?: (event: MouseUpEvent) => void
}

/**
 * Common superclass for the three mouse events. All carry screen-cell
 * coordinates and the raw SGR button code so handlers can detect the
 * specific button (low 2 bits: 0=left, 1=mid, 2=right) and modifier
 * bits (0x04=shift, 0x08=alt, 0x10=ctrl).
 */
class MouseEvent extends Event {
  /** 0-indexed screen column. */
  readonly col: number
  /** 0-indexed screen row. */
  readonly row: number
  /**
   * Raw SGR button byte. Low 2 bits = button index (0=left, 1=mid,
   * 2=right). 0x04=shift, 0x08=alt, 0x10=ctrl. The motion bit (0x20)
   * is masked off — it's a transport detail, not a button identity.
   */
  readonly button: number

  constructor(col: number, row: number, button: number) {
    super()
    this.col = col
    this.row = row
    this.button = button
  }

  /** True if Shift was held during this event. */
  get shiftKey(): boolean {
    return (this.button & 0x04) !== 0
  }

  /** True if Alt/Option was held. */
  get altKey(): boolean {
    return (this.button & 0x08) !== 0
  }

  /** True if Ctrl was held. */
  get ctrlKey(): boolean {
    return (this.button & 0x10) !== 0
  }
}

/**
 * Fired on mouse press over an element. Bubbles from the deepest hit
 * node up through `parentNode`. Call `stopImmediatePropagation()` to
 * prevent ancestors' onMouseDown from firing.
 *
 * Inside the handler, call `event.captureGesture({ onMove, onUp })`
 * to start a drag-style gesture — the renderer will route subsequent
 * motion events to `onMove` and the eventual release to `onUp`,
 * suppressing selection for the lifetime of the drag.
 *
 * Only fires inside `<AlternateScreen>` where mouse tracking is on.
 */
export class MouseDownEvent extends MouseEvent {
  /**
   * Press column relative to the current handler's Box (col - box.x).
   * Recomputed by the dispatcher before each handler fires, so an
   * onMouseDown on a container sees coords relative to that container,
   * not to any child the press landed on.
   */
  localCol = 0
  /** Press row relative to the current handler's Box. */
  localRow = 0

  /** @internal — set by captureGesture, read by the App after dispatch. */
  _capturedHandlers: GestureHandlers | null = null

  /**
   * Claim mouse-motion + mouse-release events for the rest of this
   * drag gesture. Once captured, motion events route to
   * `handlers.onMove` even when the cursor leaves this element's
   * bounds; release fires `handlers.onUp` and clears the capture.
   *
   * Calling this multiple times during one onMouseDown dispatch
   * silently overwrites — last call wins. Matches web pointer-events
   * `setPointerCapture` semantics.
   */
  captureGesture(handlers: GestureHandlers): void {
    this._capturedHandlers = handlers
  }
}

/**
 * Fired during a captured gesture for each mouse-move event the
 * terminal reports (typically one per cell crossed). Does NOT bubble
 * through the DOM tree — it goes directly to the gesture handler
 * installed via `MouseDownEvent.captureGesture`.
 */
export class MouseMoveEvent extends MouseEvent {}

/**
 * Fired exactly once at the end of a captured gesture, on mouse
 * release. Does NOT bubble through the DOM tree — it goes directly to
 * the gesture handler installed via `MouseDownEvent.captureGesture`.
 *
 * The cursor's `(col, row)` at release time is on the event — handlers
 * can hit-test from the user-facing API (or read it directly) to find
 * the drop target.
 */
export class MouseUpEvent extends MouseEvent {}
