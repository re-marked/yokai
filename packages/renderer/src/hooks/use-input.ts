import { useContext, useEffect, useLayoutEffect } from 'react'
import { useEventCallback } from 'usehooks-ts'
import { WindowFocusContext } from '../components/Window/context.js'
import type { InputEvent, Key } from '../events/input-event'
import useStdin from './use-stdin'

type Handler = (input: string, key: Key, event: InputEvent) => void

type Options = {
  /**
   * Enable or disable capturing of user input.
   * Useful when there are multiple useInput hooks used at once to avoid handling the same input several times.
   *
   * When this hook is used INSIDE a `<Window>`, `isActive` defaults to
   * the enclosing Window's `isFocused` state — keyboard input auto-gates
   * to the focused window, no boilerplate. Pass `isActive: true`
   * explicitly to opt out of the auto-gating (e.g. a Window-scoped
   * shortcut that should fire even when the window is blurred).
   *
   * Outside any Window, `isActive` defaults to `true` — back-compat
   * with consumers built before the Window primitive existed.
   *
   * @default Window's isFocused if inside a Window, else true
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
 * ## Auto-gating inside `<Window>`
 *
 * When `useInput` runs inside a `<Window>` subtree, the handler only
 * fires while that Window is focused — the framework derives `isActive`
 * from `WindowFocusContext` so consumer code drops the
 * `if (myWindowId === activeWindowId) return` boilerplate. Outside any
 * Window, behavior is unchanged. Explicit `isActive` always wins over
 * the auto-gating (set `isActive: true` to fire regardless of window
 * focus). See A18.
 */
const useInput = (inputHandler: Handler, options: Options = {}) => {
  const { setRawMode, internal_exitOnCtrlC, internal_eventEmitter } = useStdin()
  // Read the enclosing Window's focus state. `null` outside any Window
  // — in that case the gating short-circuits to "always active" so apps
  // that don't use Windows behave exactly as before. Distinguishing
  // "explicit isActive" from "auto-gated isActive" matters here: an
  // app that passed `isActive: false` deliberately must still get false,
  // even inside a focused Window.
  const windowFocus = useContext(WindowFocusContext)
  const effectiveActive =
    options.isActive !== undefined
      ? options.isActive
      : windowFocus === null
        ? true
        : windowFocus.isFocused

  // useLayoutEffect (not useEffect) so that raw mode is enabled synchronously
  // during React's commit phase, before render() returns. With useEffect, raw
  // mode setup is deferred to the next event loop tick via React's scheduler,
  // leaving the terminal in cooked mode — keystrokes echo and the cursor is
  // visible until the effect fires.
  useLayoutEffect(() => {
    if (effectiveActive === false) {
      return
    }

    setRawMode(true)

    return () => {
      setRawMode(false)
    }
  }, [effectiveActive, setRawMode])

  // Register the listener once on mount so its slot in the EventEmitter's
  // listener array is stable. If isActive were in the effect's deps, the
  // listener would re-append on false→true, moving it behind listeners
  // that registered while it was inactive — breaking
  // stopImmediatePropagation() ordering. useEventCallback keeps the
  // reference stable while reading latest isActive/inputHandler from
  // closure (it syncs via useLayoutEffect, so it's compiler-safe).
  const handleData = useEventCallback((event: InputEvent) => {
    if (effectiveActive === false) {
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
