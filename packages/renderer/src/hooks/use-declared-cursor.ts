import { useCallback, useContext, useLayoutEffect, useRef } from 'react'
import CursorDeclarationContext from '../components/CursorDeclarationContext'
import type { DOMElement } from '../dom'
import type { Color } from '../styles'
import type { CursorStyle } from '../termio/dec'

export type UseDeclaredCursorOptions = {
  /** Line number within the declared node (cell row, 0-indexed). */
  readonly line: number
  /** Display column within the declared node (cell col, 0-indexed). */
  readonly column: number
  /**
   * When true, set the declared position so the terminal cursor parks
   * at (line, column) of the attached node. When false, clear the
   * declaration (conditionally — see implementation note about sibling
   * handoff and memoized siblings).
   */
  readonly active: boolean
  /**
   * Optional cursor shape override (DECSCUSR). When set, ink emits
   * `CSI Ps SP q` alongside the position write. When undefined, the
   * terminal's configured shape wins. Restored to terminal default
   * automatically when the declaration clears.
   */
  readonly style?: CursorStyle
  /**
   * Optional blink override. Pairs with `style` in the DECSCUSR
   * sequence — DECSCUSR can't set just one half, so leaving either
   * unset defaults that half (`style ?? 'block'`, `blink ?? true`).
   */
  readonly blink?: boolean
  /**
   * Optional cursor color override (OSC 12). Support varies by
   * terminal — xterm, iTerm2, kitty, alacritty, Windows Terminal, VS
   * Code all honor it; older terminals ignore the sequence (no harm
   * done). `ansi256(N)` colors aren't supported by OSC 12 syntax.
   * Restored to terminal default automatically when the declaration
   * clears.
   */
  readonly color?: Color
}

/**
 * Declares where the terminal cursor should be parked after each frame,
 * plus optional shape / blink / color overrides.
 *
 * Terminal emulators render IME preedit text at the physical cursor
 * position, and screen readers / screen magnifiers track the native
 * cursor — so parking it at the text input's caret makes CJK input
 * appear inline and lets accessibility tools follow the input.
 *
 * Returns a ref callback to attach to the Box that contains the input.
 * The declared (line, column) is interpreted relative to that Box's
 * nodeCache rect (populated by renderNodeToOutput).
 *
 * Timing: Both ref attach and useLayoutEffect fire in React's layout
 * phase — after resetAfterCommit calls scheduleRender. scheduleRender
 * defers onRender via queueMicrotask, so onRender runs AFTER layout
 * effects commit and reads the fresh declaration on the first frame
 * (no one-keystroke lag). Test env uses onImmediateRender (synchronous,
 * no microtask), so tests compensate by calling ink.onRender()
 * explicitly after render.
 *
 * @example
 *   const cursorRef = useDeclaredCursor({
 *     line: caret.line,
 *     column: caret.col,
 *     active: isFocused,
 *     style: 'bar',
 *     blink: false,
 *     color: '#00ff00',
 *   })
 *   return <Box ref={cursorRef}>...</Box>
 */
export function useDeclaredCursor({
  line,
  column,
  active,
  style,
  blink,
  color,
}: UseDeclaredCursorOptions): (element: DOMElement | null) => void {
  const setCursorDeclaration = useContext(CursorDeclarationContext)
  const nodeRef = useRef<DOMElement | null>(null)

  const setNode = useCallback((node: DOMElement | null) => {
    nodeRef.current = node
  }, [])

  // When active, set unconditionally. When inactive, clear conditionally
  // (only if the currently-declared node is ours). The node-identity check
  // handles two hazards:
  //   1. A memo()ized active instance elsewhere (e.g. the search input in
  //      a memo'd Footer) doesn't re-render this commit — an inactive
  //      instance re-rendering here must not clobber it.
  //   2. Sibling handoff (menu focus moving between list items) — when
  //      focus moves opposite to sibling order, the newly-inactive item's
  //      effect runs AFTER the newly-active item's set. Without the node
  //      check it would clobber.
  // No dep array: must re-declare every commit so the active instance
  // re-claims the declaration after another instance's unmount-cleanup or
  // sibling handoff nulls it. style/blink/color are forwarded as-is —
  // ink dedupes via its own `cursorStyleApplied`/`cursorColorApplied`
  // tracking, so this hook doesn't need to memoize the declaration.
  useLayoutEffect(() => {
    const node = nodeRef.current
    if (active && node) {
      setCursorDeclaration({
        relativeX: column,
        relativeY: line,
        node,
        style,
        blink,
        color,
      })
    } else {
      setCursorDeclaration(null, node)
    }
  })

  // Clear on unmount (conditionally — another instance may own by then).
  // Separate effect with empty deps so cleanup only fires once — not on
  // every line/column change, which would transiently null between commits.
  useLayoutEffect(() => {
    return () => {
      setCursorDeclaration(null, nodeRef.current)
    }
  }, [setCursorDeclaration])

  return setNode
}
