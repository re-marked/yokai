import { useCallback, useContext, useEffect, useState } from 'react'
import FocusContext from '../components/FocusContext.js'
import type { DOMElement } from '../dom.js'

export type UseFocusManagerResult = {
  /**
   * The DOM element that currently has focus, or null. Re-renders the
   * consumer component whenever focus changes anywhere in the tree
   * — useful for "show a status line indicating which element is
   * focused" patterns. Same value the FocusManager exposes as
   * `activeElement`, but reactive.
   */
  focused: DOMElement | null
  /**
   * Imperatively focus a specific node. Pass a DOM element ref's
   * `.current`. No-op when null is passed or outside FocusContext.
   */
  focus: (node: DOMElement | null) => void
  /**
   * Move focus to the next element in tab order. Wraps around at the
   * end of the order. Same behavior as Tab.
   */
  focusNext: () => void
  /**
   * Move focus to the previous element in tab order. Wraps around.
   * Same behavior as Shift+Tab.
   */
  focusPrevious: () => void
  /** Clear focus entirely. */
  blur: () => void
}

/**
 * React access to the global FocusManager. Returns reactive `focused`
 * + imperative actions. Use when a component needs to know about
 * GLOBAL focus (any element, not its own) — e.g. a status bar that
 * displays the focused element's label, or a modal that needs to
 * pull focus into itself on open.
 *
 * For per-element focus tracking (the more common case), use
 * `useFocus` instead — it's more efficient (subscribes only to the
 * one element's transitions) and pairs naturally with `tabIndex` on
 * a single Box.
 *
 * Outside FocusContext (unit-test render bypassing App), all actions
 * are no-ops and `focused` stays null. No throws — degrades silently.
 *
 * @example
 *   function StatusBar() {
 *     const { focused, focusNext } = useFocusManager()
 *     return (
 *       <Box>
 *         <Text>focused: {focused?.attributes.label ?? 'none'}</Text>
 *         <Button onClick={focusNext}>Tab</Button>
 *       </Box>
 *     )
 *   }
 */
export function useFocusManager(): UseFocusManagerResult {
  const ctx = useContext(FocusContext)
  // Mirror activeElement into local state so React re-renders consumers
  // when focus moves. The global subscribe fires after every focus
  // change, including programmatic moves and Tab cycling — so this
  // covers all paths.
  const [focused, setFocused] = useState<DOMElement | null>(ctx?.manager.activeElement ?? null)

  useEffect(() => {
    if (!ctx) return
    // Sync immediately in case focus moved between mount and subscribe.
    setFocused(ctx.manager.activeElement)
    return ctx.manager.subscribe(() => {
      setFocused(ctx.manager.activeElement)
    })
  }, [ctx])

  const focus = useCallback(
    (node: DOMElement | null): void => {
      if (!ctx || !node) return
      ctx.manager.focus(node)
    },
    [ctx],
  )

  const focusNext = useCallback((): void => {
    if (!ctx) return
    ctx.manager.focusNext(ctx.root)
  }, [ctx])

  const focusPrevious = useCallback((): void => {
    if (!ctx) return
    ctx.manager.focusPrevious(ctx.root)
  }, [ctx])

  const blur = useCallback((): void => {
    if (!ctx) return
    ctx.manager.blur()
  }, [ctx])

  return { focused, focus, focusNext, focusPrevious, blur }
}

export default useFocusManager
