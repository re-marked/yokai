import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import FocusContext from '../components/FocusContext.js'
import type { DOMElement } from '../dom.js'

export type UseFocusOptions = {
  /**
   * Focus this element on mount (alternative to setting `autoFocus`
   * on `<Box>`). Equivalent in effect; this is the hook-side spelling
   * for consumers that prefer to keep all focus behavior in one place.
   * Default: false.
   */
  autoFocus?: boolean
}

export type UseFocusResult = {
  /**
   * Attach to the focusable element. The hook only tracks state for
   * elements you mark `tabIndex >= 0` on the JSX side — that's the
   * authoritative "is this focusable" signal, mirrored from yoga's DOM
   * model. The ref simply gives the hook a handle to the same node.
   */
  ref: { current: DOMElement | null }
  /** True iff the attached element currently has focus. */
  isFocused: boolean
  /**
   * Imperatively focus this element. No-op when the element isn't yet
   * mounted, or when not inside a FocusContext (e.g. unit-test render
   * that bypasses App).
   */
  focus: () => void
}

/**
 * Track focus state for a single element + expose imperative focus.
 *
 * Pair with `tabIndex={0}` on the rendered Box — the hook doesn't
 * inject the prop because it can't reach into your JSX, so you opt in
 * by passing tabIndex yourself. This is the same explicit pattern web
 * a11y uses.
 *
 * @example
 *   function MenuItem({ label }) {
 *     const { ref, isFocused } = useFocus()
 *     return (
 *       <Box ref={ref} tabIndex={0} backgroundColor={isFocused ? 'cyan' : undefined}>
 *         <Text>{label}</Text>
 *       </Box>
 *     )
 *   }
 */
export function useFocus(options: UseFocusOptions = {}): UseFocusResult {
  const ctx = useContext(FocusContext)
  const ref = useRef<DOMElement | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const autoFocus = options.autoFocus ?? false

  // Subscribe + initialise state. Re-runs only if the FocusManager
  // identity changes (effectively never within one app), keeping
  // subscriptions stable across re-renders. Reads ref.current AFTER
  // the layout effect ensures it's been populated by the React commit.
  useEffect(() => {
    const node = ref.current
    if (!node || !ctx) return
    // Sync state with whatever's currently focused — covers the case
    // where focus moved before the subscription was set up (autoFocus
    // dispatched before this effect ran, for example).
    setIsFocused(ctx.manager.activeElement === node)
    return ctx.manager.subscribeToFocus(node, setIsFocused)
  }, [ctx])

  // autoFocus on mount. Separate effect so re-running the subscribe
  // effect doesn't re-trigger autoFocus on prop / context changes —
  // that'd steal focus back from the user every time something else
  // updates.
  useEffect(() => {
    if (!autoFocus) return
    const node = ref.current
    if (!node || !ctx) return
    ctx.manager.focus(node)
    // Intentionally only deps [autoFocus + ctx]; don't re-fire on every
    // ref change. autoFocus is conceptually a once-on-mount thing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, ctx])

  const focus = useCallback(() => {
    const node = ref.current
    if (!node || !ctx) return
    ctx.manager.focus(node)
  }, [ctx])

  return { ref, isFocused, focus }
}

export default useFocus
