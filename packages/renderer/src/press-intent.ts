/**
 * Press-intent classification for left-mouse-button presses.
 *
 * Mouse-down events arrive at `App.handleMouseEvent` with three orthogonal
 * pieces of information attached:
 *
 *   - Did any onMouseDown handler call `event.captureGesture(...)` or
 *     `event.captureGestureTentatively(...)`? (drag/drop/resize)
 *   - Was there an `onClick` handler anywhere in the bubble chain?
 *     (button, link, anything click-driven)
 *   - Did the user hold a force-select modifier (Shift / Alt) while
 *     pressing? (override "this is a click" with "no, give me text")
 *
 * Rather than letting these decisions tangle inside the press handler,
 * `computePressIntent` reduces them to one of four named intents up
 * front. Downstream code branches on the intent, not the raw flags —
 * easier to read, easier to test, harder to drift out of sync.
 *
 * The motivating bug is shakedown B8 (issue #61): a press over a Box
 * with `onClick` would start a text selection because selection is
 * opt-out. Any motion between press and release escalated the click
 * into a selection drag, eating the click. Treating "press over a
 * clickable subtree" as `click` intent (and skipping selection-start
 * + motion-extension for that press) restores the click reliably,
 * while the force-select modifier preserves the user's escape hatch
 * for selecting text inside a clickable element (a Button label, a
 * link's anchor text, etc.).
 */

/** What the press is meant to do, decided once at press time. */
export type PressIntent =
  /** A handler called captureGesture(...) — confirmed drag-style gesture.
   *  Selection is suppressed for the lifetime of the gesture; release
   *  fires onUp, not onClick. */
  | 'gesture-confirmed'
  /** A handler called captureGestureTentatively(...) — gesture installed
   *  but only commits on motion. Selection is started anyway so a
   *  press-without-motion still produces a click on release; first
   *  motion promotes the gesture and cancels the in-progress selection.
   *  Existing semantics — see App.activeGestureTentative. */
  | 'gesture-tentative'
  /** No gesture was captured, but the press hit a subtree containing an
   *  onClick handler. Selection-start AND motion-extension are
   *  suppressed for this press; release fires onClickAt. The user's
   *  intent was a click, not selection — accidental jitter between
   *  press and release shouldn't escalate into a selection drag. */
  | 'click'
  /** Default: no gesture, no click handler in the chain. Selection
   *  starts on press and extends with motion as before. */
  | 'select'

/** Inputs to the intent decision. Field names mirror the data sources
 *  in App.handleMouseEvent so the call site is one-to-one obvious. */
export type PressIntentInputs = {
  /** Result of the onMouseDown DOM dispatch. 'confirmed' iff a handler
   *  called captureGesture; 'tentative' iff captureGestureTentatively;
   *  null otherwise. */
  gesture: 'confirmed' | 'tentative' | null
  /** True if any node in the press's hit chain (deepest hit + ancestors)
   *  has an onClick handler. */
  clickable: boolean
  /** True if the user is signalling "this is a text-selection press"
   *  via a modifier key (Shift or Alt). Demotes click intent back to
   *  select so consumers can highlight text inside a clickable region. */
  forceSelect: boolean
}

/**
 * Reduce the three press signals to one named intent.
 *
 * Precedence (top wins):
 *   1. Confirmed gesture — overrides everything; the handler explicitly
 *      claimed the press. Even Shift-drag inside a captured gesture
 *      stays a gesture; modifiers are the gesture handler's to interpret.
 *   2. Tentative gesture — same precedence as confirmed for selection
 *      purposes (selection still starts, but only as an artifact of
 *      tentative-gesture release semantics, not because intent says
 *      "select"). Modifiers do not retract a tentative capture.
 *   3. Clickable + !forceSelect → 'click'.
 *   4. Otherwise → 'select'. Includes clickable + forceSelect (the
 *      user explicitly asked for selection over a clickable element).
 */
export function computePressIntent(inputs: PressIntentInputs): PressIntent {
  if (inputs.gesture === 'confirmed') return 'gesture-confirmed'
  if (inputs.gesture === 'tentative') return 'gesture-tentative'
  if (inputs.clickable && !inputs.forceSelect) return 'click'
  return 'select'
}
