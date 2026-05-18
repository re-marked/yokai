import { useContext, useEffect, useLayoutEffect } from 'react'
import { useEventCallback } from 'usehooks-ts'
import { CursorOverWindowContext, WindowFocusContext } from '../components/Window/context.js'
import type { InputEvent, Key } from '../events/input-event'
import useStdin from './use-stdin'

type Handler = (input: string, key: Key, event: InputEvent) => void

type Options = {
  /**
   * Enable or disable capturing of user input.
   * Useful when there are multiple useInput hooks used at once to avoid handling the same input several times.
   *
   * When this hook is used INSIDE a `<Window>`, `isActive` defaults to
   * scope-aware routing:
   *   - keyboard events fire when the enclosing Window is focused
   *   - wheel events fire when the cursor is over the enclosing Window
   *     (hover-scoped, matching real-OS scroll behavior)
   * Pass `isActive: true` explicitly to opt out of all auto-gating
   * (handler fires regardless of focus or hover); pass `isActive: false`
   * to suppress unconditionally.
   *
   * Outside any Window, `isActive` defaults to `true` — back-compat with
   * consumers built before the Window primitive existed.
   *
   * @default Window's isFocused / isCursorOver split if inside a Window, else true
   */
  isActive?: boolean
}

/**
 * This hook is used for handling user input.
 * It's a more convenient alternative to using `StdinContext` and listening to `data` events.
 * The callback you pass to `useInput` is called for each character when user enters any input.
 * However, if user pastes text and it's more than one character, the callback will be called only once and the whole string will be passed as `input`.
 *
 * ```
 * import {useInput} from 'ink';
 *
 * const UserInput = () => {
 *   useInput((input, key) => {
 *     if (input === 'q') {
 *       // Exit program
 *     }
 *
 *     if (key.leftArrow) {
 *       // Left arrow key pressed
 *     }
 *   });
 *
 *   return …
 * };
 * ```
 *
 * ## Auto-routing inside `<Window>` (A18)
 *
 * When `useInput` runs inside a `<Window>` subtree, the framework
 * derives `isActive` from context so consumers drop boilerplate like
 * `if (myWindowId !== activeWindowId) return`:
 *
 * - **Keyboard events** (arrows, letters, ctrl-shortcuts, paste) fire
 *   only while the enclosing Window is FOCUSED. Matches the
 *   "keyboard follows focus" mental model.
 * - **Wheel events** (`key.wheelUp` / `key.wheelDown`) fire only while
 *   the cursor is OVER the enclosing Window. Hover-scoped, matching
 *   real OSes (scroll whatever you're hovering, not what has focus).
 *
 * Outside any Window, the auto-routing short-circuits and the handler
 * fires unconditionally — pre-Window apps see no behavior change.
 *
 * Explicit `isActive` (`true` or `false`) always wins over the
 * auto-routing.
 */
const useInput = (inputHandler: Handler, options: Options = {}) => {
  const { setRawMode, internal_exitOnCtrlC, internal_eventEmitter } = useStdin()
  // Both contexts default to null outside any Window — auto-routing
  // short-circuits to "always fire" in that case for back-compat.
  // Distinguishing "explicit isActive" from "auto-routed isActive"
  // matters: an app that passed `isActive: false` deliberately must
  // still get false, even inside a focused / hovered Window.
  const windowFocus = useContext(WindowFocusContext)
  const cursorOver = useContext(CursorOverWindowContext)
  const insideWindow = windowFocus !== null

  // setRawMode: needs to be on whenever ANY input might fire. With the
  // per-event routing split below, that's "focused OR cursor-over"
  // inside a Window. Outside a Window, always on (back-compat). Explicit
  // `isActive` overrides both.
  const explicitlyActive = options.isActive
  const rawModeActive =
    explicitlyActive !== undefined
      ? explicitlyActive
      : !insideWindow
        ? true
        : windowFocus.isFocused || (cursorOver?.isOver ?? false)

  // useLayoutEffect (not useEffect) so that raw mode is enabled synchronously
  // during React's commit phase, before render() returns. With useEffect, raw
  // mode setup is deferred to the next event loop tick via React's scheduler,
  // leaving the terminal in cooked mode — keystrokes echo and the cursor is
  // visible until the effect fires.
  useLayoutEffect(() => {
    if (rawModeActive === false) {
      return
    }

    setRawMode(true)

    return () => {
      setRawMode(false)
    }
  }, [rawModeActive, setRawMode])

  // Register the listener once on mount so its slot in the EventEmitter's
  // listener array is stable. If isActive were in the effect's deps, the
  // listener would re-append on false→true, moving it behind listeners
  // that registered while it was inactive — breaking
  // stopImmediatePropagation() ordering. useEventCallback keeps the
  // reference stable while reading latest isActive/inputHandler from
  // closure (it syncs via useLayoutEffect, so it's compiler-safe).
  const handleData = useEventCallback((event: InputEvent) => {
    // Per-event routing split: wheel events are hover-scoped; everything
    // else is focus-scoped. Both fall back to "always fire" outside a
    // Window. Explicit `isActive` overrides the entire branch.
    let shouldFire: boolean
    if (explicitlyActive !== undefined) {
      shouldFire = explicitlyActive
    } else if (!insideWindow) {
      shouldFire = true
    } else {
      const isWheel = event.key.wheelUp || event.key.wheelDown
      shouldFire = isWheel ? (cursorOver?.isOver ?? false) : windowFocus.isFocused
    }
    if (!shouldFire) {
      return
    }
    const { input, key } = event

    // If app is not supposed to exit on Ctrl+C, then let input listener handle it
    // Note: discreteUpdates is called at the App level when emitting events,
    // so all listeners are already within a high-priority update context.
    if (!(input === 'c' && key.ctrl) || !internal_exitOnCtrlC) {
      inputHandler(input, key, event)
    }
  })

  useEffect(() => {
    internal_eventEmitter?.on('input', handleData)

    return () => {
      internal_eventEmitter?.removeListener('input', handleData)
    }
  }, [internal_eventEmitter, handleData])
}

export default useInput
