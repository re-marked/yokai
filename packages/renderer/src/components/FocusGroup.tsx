import type React from 'react'
import { type PropsWithChildren, useCallback, useRef } from 'react'
import type { DOMElement } from '../dom.js'
import type { KeyboardEvent } from '../events/keyboard-event.js'
import useFocusManager from '../hooks/use-focus-manager.js'
import Box, { type Props as BoxProps } from './Box.js'

/**
 * Which arrow keys move focus within the group.
 *
 * - `'row'`     — ←/→ navigate, ↑/↓ are passed through
 * - `'column'`  — ↑/↓ navigate, ←/→ are passed through  (default)
 * - `'both'`    — all four arrows navigate (linear order; for proper
 *                 2D movement use a future grid mode)
 */
export type FocusGroupDirection = 'row' | 'column' | 'both'

export type FocusGroupProps = BoxProps & {
  /**
   * Which arrow keys traverse focus inside the group. Defaults to
   * `'column'` because most TUI lists / menus stack vertically.
   */
  direction?: FocusGroupDirection
  /**
   * When true, pressing past the last/first focusable wraps around to
   * the other end. Default false — pressing past the boundary is a
   * no-op so focus visibly stops, which matches typical menu UX.
   */
  wrap?: boolean
  /**
   * When false, the group does not capture arrow keys. Useful when you
   * want to disable navigation contextually (e.g. while a modal is
   * open). Default true.
   */
  isActive?: boolean
}

/**
 * Wraps a `<Box>` and adds arrow-key navigation between focusable
 * descendants. Children opt in to focusability the standard way —
 * `<Box tabIndex={0}>` (or via `useFocus()`'s ref + tabIndex). Tab /
 * Shift+Tab still cycle through ALL tabbables in the entire tree;
 * arrows are bounded to this group.
 *
 * Behavior contract:
 *
 * - Listens for arrows only when the currently focused element is a
 *   descendant of this group. Arrows pressed while focus is elsewhere
 *   (or no focus) are ignored — other groups / handlers see them
 *   unchanged.
 * - Tab order = tree order, same walker FocusManager.focusNext uses.
 *   Predictable and matches what `<FocusGroup>` consumers see in the
 *   JSX.
 * - Wrap is per-group: each group decides independently whether to
 *   cycle at its own boundaries.
 * - Nested groups work: the inner group's onKeyDown fires first
 *   (deepest target on the bubble path), navigates, and calls
 *   preventDefault. The outer group's onKeyDown fires next and skips
 *   on `event.defaultPrevented`, so the inner group wins. To suppress
 *   arrow nav for a focused element entirely (e.g. a `<TextInput>`
 *   that wants ←/→ for caret movement), the focused element's
 *   onKeyDown can call `preventDefault()` first.
 *
 * @example
 *   <FocusGroup direction="column" wrap>
 *     {items.map((item) => (
 *       <Box key={item.id} tabIndex={0}>
 *         <Text>{item.label}</Text>
 *       </Box>
 *     ))}
 *   </FocusGroup>
 */
export default function FocusGroup({
  direction = 'column',
  wrap = false,
  isActive = true,
  children,
  ...boxProps
}: PropsWithChildren<FocusGroupProps>): React.ReactNode {
  const ref = useRef<DOMElement>(null)
  const { focused, focus } = useFocusManager()

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isActive) return
      if (e.defaultPrevented) return // a focused descendant claimed the key
      const node = ref.current
      if (!node || !focused) return
      if (!isDescendant(focused, node)) return

      const k = e.key
      // Decide direction. Each branch checks independently so 'both'
      // handles all four arrows. 'row' / 'column' ignore the irrelevant
      // axis — keys pass through to other handlers / groups.
      let move: -1 | 1 | 0 = 0
      if (direction === 'row' || direction === 'both') {
        if (k === 'left') move = -1
        else if (k === 'right') move = 1
      }
      if (move === 0 && (direction === 'column' || direction === 'both')) {
        if (k === 'up') move = -1
        else if (k === 'down') move = 1
      }
      if (move === 0) return

      const tabbables = collectTabbablesInSubtree(node)
      if (tabbables.length === 0) return
      const idx = tabbables.indexOf(focused)
      if (idx === -1) return // focused is somewhere weird, give up

      let nextIdx = idx + move
      if (nextIdx < 0 || nextIdx >= tabbables.length) {
        if (!wrap) return
        nextIdx = (nextIdx + tabbables.length) % tabbables.length
      }
      const target = tabbables[nextIdx]
      if (target) {
        e.preventDefault()
        focus(target)
      }
    },
    [direction, wrap, isActive, focused, focus],
  )

  return (
    <Box ref={ref} {...boxProps} onKeyDown={onKeyDown}>
      {children}
    </Box>
  )
}

// ── helpers (exported for testing) ───────────────────────────────────

/**
 * Walk a subtree and collect every node with `tabIndex >= 0`, in tree
 * order. Mirrors the walker used by FocusManager.focusNext but scoped
 * to a subtree rather than the whole document — so a FocusGroup only
 * navigates within its own descendants.
 */
export function collectTabbablesInSubtree(node: DOMElement): DOMElement[] {
  const result: DOMElement[] = []
  walk(node, result)
  return result
}

function walk(node: DOMElement, result: DOMElement[]): void {
  const tabIndex = node.attributes.tabIndex
  if (typeof tabIndex === 'number' && tabIndex >= 0) {
    result.push(node)
  }
  for (const child of node.childNodes) {
    if (child.nodeName !== '#text') {
      walk(child as DOMElement, result)
    }
  }
}

/**
 * True iff `node` is `ancestor` or one of its descendants. Walks up via
 * parentNode — same shape as the focus manager's `isInTree` helper but
 * checks against ANY ancestor, not just the root.
 */
export function isDescendant(node: DOMElement, ancestor: DOMElement): boolean {
  let current: DOMElement | undefined = node
  while (current) {
    if (current === ancestor) return true
    current = current.parentNode
  }
  return false
}
