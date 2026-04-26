import type React from 'react'
import { type PropsWithChildren, useEffect, useRef } from 'react'
import type { Except } from 'type-fest'
import type { DOMElement } from '../dom.js'
import {
  type DropInfo,
  type DropTargetCallbacks,
  registerDropTarget,
  unregisterDropTarget,
} from '../drag-registry.js'
import Box, { type Props as BoxProps } from './Box.js'

export type { DropInfo } from '../drag-registry.js'

export type DropTargetProps = Except<BoxProps, 'ref'> & {
  /**
   * Predicate: should this target react to a drag carrying `data`? When
   * present and returns false, the target is invisible to the drag —
   * no enter / over / leave / drop callbacks fire, and a higher target
   * underneath can receive the drop instead. When omitted, the target
   * accepts every drag.
   *
   * Use for kind filtering (`(d) => d?.kind === 'card'`) or for
   * conditional drop zones (e.g. only accept cards from a different
   * column to prevent meaningless self-drops).
   */
  accept?: (data: unknown) => boolean
  /**
   * Fires once when the cursor first enters this target's rect during
   * an active drag. Pair with `onDragLeave` to manage hover styling.
   * Does not fire if `accept` rejects the data.
   */
  onDragEnter?: (info: DropInfo) => void
  /**
   * Fires on every motion event while the cursor is inside this
   * target's rect. Useful for live previews like "show insertion
   * indicator at cursor position."
   */
  onDragOver?: (info: DropInfo) => void
  /**
   * Fires when the cursor leaves this target's rect, or when the drag
   * ends while still inside (so subscribers can clean up hover state
   * symmetrically without observing the gesture transition).
   */
  onDragLeave?: () => void
  /**
   * Fires when the dragger releases over this target. Only the TOPMOST
   * target containing the cursor at release receives onDrop — even if
   * other targets are also containing it (matches paint-order: highest
   * z-index wins, deeper-in-tree breaks ties).
   */
  onDrop?: (info: DropInfo) => void
}

/**
 * A region that reacts to active drags from `<Draggable>`. Wraps a
 * `<Box>` — pass any Box prop (size, bg, border, padding, children)
 * and DropTarget hooks the gesture lifecycle on top.
 *
 * Behavior contract:
 *
 * - Targets only receive callbacks while a drag is in progress; the
 *   element is inert outside drags.
 * - `accept` is called once per gesture-tick to decide whether THIS
 *   target participates. A target whose `accept` rejected at one tick
 *   can accept at a later tick if its `accept` predicate becomes truthy
 *   (e.g. the data changed somehow) — the registry re-evaluates on
 *   every cursor motion.
 * - `onDragEnter` / `onDragOver` / `onDragLeave` fire on EVERY containing
 *   target (multiple may fire on the same tick, e.g. nested targets).
 *   `onDrop` fires only on the topmost.
 * - The `local` field on DropInfo gives the cursor's position relative
 *   to this target's top-left, in cell coordinates — useful for
 *   "insert at this position within the target" interactions.
 *
 * @example
 *   <DropTarget
 *     accept={(d) => (d as { kind?: string } | undefined)?.kind === 'card'}
 *     onDragEnter={() => setHover(true)}
 *     onDragLeave={() => setHover(false)}
 *     onDrop={({ data }) => moveCardToColumn(data.id, columnId)}
 *     backgroundColor={hover ? 'blue' : 'gray'}
 *     width={30}
 *     height={10}
 *   />
 */
export default function DropTarget({
  accept,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
  ...boxProps
}: PropsWithChildren<DropTargetProps>): React.ReactNode {
  const nodeRef = useRef<DOMElement>(null)
  // Bundle the latest callbacks into a ref so the registry tick reads
  // current props every time. Without this, registerDropTarget would
  // capture stale closures from the first render and the user's
  // callbacks would never see updated state.
  const callbacksRef = useRef<DropTargetCallbacks>({
    accept,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
  })
  callbacksRef.current = { accept, onDragEnter, onDragOver, onDragLeave, onDrop }

  useEffect(() => {
    const id = registerDropTarget({
      // Reads ref.current each tick — refs aren't populated until after
      // mount, and may be re-set if React re-creates the host node
      // (rare but possible).
      getNode: () => nodeRef.current,
      getCallbacks: () => callbacksRef.current,
    })
    return () => unregisterDropTarget(id)
  }, [])

  return (
    <Box ref={nodeRef} {...boxProps}>
      {children}
    </Box>
  )
}
