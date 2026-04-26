/**
 * drag-registry tests.
 *
 * The registry is module-scope mutable state. Each test resets it via
 * `_resetDragRegistryForTesting` to keep them independent — without
 * the reset a test that left an active drag would leak into the next.
 *
 * Drop targets are tested by registering hand-built DOMElements with
 * pre-populated nodeCache rects. This bypasses both React and the
 * layout pipeline so the registry's hit-test + dispatch logic is the
 * only thing under test.
 */

import { describe, expect, it, vi } from 'vitest'
import { type DOMElement, appendChildNode, createNode, setStyle } from './dom.js'
import {
  type DropTargetCallbacks,
  _resetDragRegistryForTesting,
  dispatchDrop,
  endDrag,
  isDragActive,
  registerDropTarget,
  startDrag,
  tickDrag,
  unregisterDropTarget,
} from './drag-registry.js'
import { nodeCache } from './node-cache.js'

/** Build a hand-positioned absolute ink-box and pre-populate its
 *  nodeCache rect. The drag-registry reads the rect via nodeCache, so
 *  this is the minimum tree state needed to drive it. */
function mkTarget(rect: { x: number; y: number; w: number; h: number; z?: number }): DOMElement {
  const node = createNode('ink-box')
  setStyle(node, { position: 'absolute', zIndex: rect.z ?? 0 })
  nodeCache.set(node, { x: rect.x, y: rect.y, width: rect.w, height: rect.h, top: rect.y })
  return node
}

/** Register a target with a fresh callback bundle. Returns an
 *  unregister function and the bundle so tests can both clean up
 *  AND inspect calls. */
function register(
  node: DOMElement,
  cbs: DropTargetCallbacks = {},
): { unregister: () => void; cbs: Required<DropTargetCallbacks> } {
  const fullCbs: Required<DropTargetCallbacks> = {
    accept: cbs.accept ?? (() => true),
    onDragEnter: cbs.onDragEnter ?? vi.fn(),
    onDragOver: cbs.onDragOver ?? vi.fn(),
    onDragLeave: cbs.onDragLeave ?? vi.fn(),
    onDrop: cbs.onDrop ?? vi.fn(),
  }
  const id = registerDropTarget({
    getNode: () => node,
    getCallbacks: () => fullCbs,
  })
  return { unregister: () => unregisterDropTarget(id), cbs: fullCbs }
}

describe('drag-registry — startDrag / endDrag / isDragActive', () => {
  it('isDragActive is false before any drag starts', () => {
    _resetDragRegistryForTesting()
    expect(isDragActive()).toBe(false)
  })

  it('isDragActive is true between startDrag and endDrag', () => {
    _resetDragRegistryForTesting()
    startDrag({ id: 1 })
    expect(isDragActive()).toBe(true)
    endDrag()
    expect(isDragActive()).toBe(false)
  })

  it('endDrag is idempotent — safe to call without an active drag', () => {
    _resetDragRegistryForTesting()
    expect(() => endDrag()).not.toThrow()
    expect(isDragActive()).toBe(false)
  })

  it('tickDrag is a no-op when no drag is active', () => {
    _resetDragRegistryForTesting()
    const onDragEnter = vi.fn()
    const target = mkTarget({ x: 0, y: 0, w: 10, h: 5 })
    register(target, { onDragEnter })
    tickDrag(5, 2)
    expect(onDragEnter).not.toHaveBeenCalled()
  })

  it('dispatchDrop is a no-op (returns false) when no drag is active', () => {
    _resetDragRegistryForTesting()
    const onDrop = vi.fn()
    const target = mkTarget({ x: 0, y: 0, w: 10, h: 5 })
    register(target, { onDrop })
    expect(dispatchDrop(5, 2)).toBe(false)
    expect(onDrop).not.toHaveBeenCalled()
  })
})

describe('drag-registry — tickDrag enter/over/leave', () => {
  it('fires onDragEnter and onDragOver when cursor enters a target', () => {
    _resetDragRegistryForTesting()
    const target = mkTarget({ x: 10, y: 5, w: 10, h: 5 })
    const { cbs } = register(target)
    startDrag({ id: 'card' })
    tickDrag(15, 7)
    expect(cbs.onDragEnter).toHaveBeenCalledTimes(1)
    expect(cbs.onDragOver).toHaveBeenCalledTimes(1)
    // Local coords are cursor minus target's top-left.
    expect(cbs.onDragOver).toHaveBeenCalledWith({
      data: { id: 'card' },
      cursor: { col: 15, row: 7 },
      local: { col: 5, row: 2 },
    })
  })

  it('fires onDragOver but NOT onDragEnter on subsequent ticks within the same target', () => {
    _resetDragRegistryForTesting()
    const target = mkTarget({ x: 0, y: 0, w: 20, h: 10 })
    const { cbs } = register(target)
    startDrag(undefined)
    tickDrag(5, 5)
    tickDrag(6, 6)
    tickDrag(7, 7)
    expect(cbs.onDragEnter).toHaveBeenCalledTimes(1)
    expect(cbs.onDragOver).toHaveBeenCalledTimes(3)
  })

  it('fires onDragLeave when cursor exits a target', () => {
    _resetDragRegistryForTesting()
    const target = mkTarget({ x: 0, y: 0, w: 10, h: 5 })
    const { cbs } = register(target)
    startDrag(undefined)
    tickDrag(5, 2)
    tickDrag(50, 50)
    expect(cbs.onDragLeave).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire any callbacks for targets the cursor never enters', () => {
    _resetDragRegistryForTesting()
    const target = mkTarget({ x: 50, y: 50, w: 10, h: 5 })
    const { cbs } = register(target)
    startDrag(undefined)
    tickDrag(5, 2)
    expect(cbs.onDragEnter).not.toHaveBeenCalled()
    expect(cbs.onDragOver).not.toHaveBeenCalled()
    expect(cbs.onDragLeave).not.toHaveBeenCalled()
  })

  it('fires enter on multiple containing targets at the same tick (nested / overlap)', () => {
    _resetDragRegistryForTesting()
    const inner = mkTarget({ x: 5, y: 5, w: 10, h: 5 })
    const outer = mkTarget({ x: 0, y: 0, w: 30, h: 20 })
    const innerCbs = register(inner).cbs
    const outerCbs = register(outer).cbs
    startDrag(undefined)
    tickDrag(7, 6)
    expect(innerCbs.onDragEnter).toHaveBeenCalledTimes(1)
    expect(outerCbs.onDragEnter).toHaveBeenCalledTimes(1)
  })

  it('skips targets whose accept() rejects the drag data', () => {
    _resetDragRegistryForTesting()
    const target = mkTarget({ x: 0, y: 0, w: 10, h: 5 })
    const { cbs } = register(target, { accept: () => false })
    startDrag({ kind: 'wrong' })
    tickDrag(5, 2)
    expect(cbs.onDragEnter).not.toHaveBeenCalled()
    expect(cbs.onDragOver).not.toHaveBeenCalled()
  })

  it('passes the drag data to accept()', () => {
    _resetDragRegistryForTesting()
    const accept = vi.fn().mockReturnValue(true)
    const target = mkTarget({ x: 0, y: 0, w: 10, h: 5 })
    register(target, { accept })
    startDrag({ kind: 'card', id: 7 })
    tickDrag(5, 2)
    expect(accept).toHaveBeenCalledWith({ kind: 'card', id: 7 })
  })

  it('endDrag fires onDragLeave on any still-containing targets', () => {
    _resetDragRegistryForTesting()
    const target = mkTarget({ x: 0, y: 0, w: 10, h: 5 })
    const { cbs } = register(target)
    startDrag(undefined)
    tickDrag(5, 2)
    endDrag()
    expect(cbs.onDragLeave).toHaveBeenCalledTimes(1)
  })
})

describe('drag-registry — dispatchDrop', () => {
  it('fires onDrop on the topmost containing target', () => {
    _resetDragRegistryForTesting()
    const back = mkTarget({ x: 0, y: 0, w: 20, h: 10, z: 1 })
    const front = mkTarget({ x: 5, y: 2, w: 10, h: 5, z: 5 })
    const backCbs = register(back).cbs
    const frontCbs = register(front).cbs
    startDrag({ id: 1 })
    expect(dispatchDrop(7, 4)).toBe(true)
    expect(frontCbs.onDrop).toHaveBeenCalledTimes(1)
    expect(backCbs.onDrop).not.toHaveBeenCalled()
  })

  it('returns false if no target accepts the drop', () => {
    _resetDragRegistryForTesting()
    const target = mkTarget({ x: 50, y: 50, w: 10, h: 5 })
    register(target)
    startDrag(undefined)
    expect(dispatchDrop(5, 2)).toBe(false)
  })

  it('skips targets whose accept() rejects', () => {
    _resetDragRegistryForTesting()
    const target = mkTarget({ x: 0, y: 0, w: 10, h: 5 })
    const cbs = register(target, { accept: () => false }).cbs
    startDrag(undefined)
    expect(dispatchDrop(5, 2)).toBe(false)
    expect(cbs.onDrop).not.toHaveBeenCalled()
  })

  it('falls through to a non-rejecting target when the topmost rejects', () => {
    _resetDragRegistryForTesting()
    const back = mkTarget({ x: 0, y: 0, w: 20, h: 10, z: 1 })
    const front = mkTarget({ x: 5, y: 2, w: 10, h: 5, z: 5 })
    const backCbs = register(back).cbs
    const frontCbs = register(front, { accept: () => false }).cbs
    startDrag(undefined)
    expect(dispatchDrop(7, 4)).toBe(true)
    expect(backCbs.onDrop).toHaveBeenCalledTimes(1)
    expect(frontCbs.onDrop).not.toHaveBeenCalled()
  })

  it('breaks ties by tree depth (deeper wins) when z-indexes match', () => {
    _resetDragRegistryForTesting()
    // Build deeper-in-tree wrapper > inner; both at z=0.
    const wrapper = createNode('ink-box')
    const inner = createNode('ink-box')
    appendChildNode(wrapper, inner)
    setStyle(wrapper, { position: 'absolute' })
    setStyle(inner, { position: 'absolute' })
    nodeCache.set(wrapper, { x: 0, y: 0, width: 20, height: 10, top: 0 })
    nodeCache.set(inner, { x: 0, y: 0, width: 20, height: 10, top: 0 })
    const { cbs: wrapperCbs } = register(wrapper)
    const { cbs: innerCbs } = register(inner)
    startDrag(undefined)
    expect(dispatchDrop(5, 5)).toBe(true)
    expect(innerCbs.onDrop).toHaveBeenCalledTimes(1)
    expect(wrapperCbs.onDrop).not.toHaveBeenCalled()
  })

  it('forwards the drag data and cursor + local coords to onDrop', () => {
    _resetDragRegistryForTesting()
    const target = mkTarget({ x: 10, y: 5, w: 20, h: 10 })
    const { cbs } = register(target)
    startDrag({ id: 'card-7' })
    dispatchDrop(15, 8)
    expect(cbs.onDrop).toHaveBeenCalledWith({
      data: { id: 'card-7' },
      cursor: { col: 15, row: 8 },
      local: { col: 5, row: 3 },
    })
  })
})

describe('drag-registry — registration lifecycle', () => {
  it('unregister removes a target from subsequent ticks', () => {
    _resetDragRegistryForTesting()
    const target = mkTarget({ x: 0, y: 0, w: 10, h: 5 })
    const { unregister, cbs } = register(target)
    startDrag(undefined)
    tickDrag(5, 2)
    expect(cbs.onDragEnter).toHaveBeenCalledTimes(1)
    unregister()
    tickDrag(6, 3)
    // No additional calls — target is gone.
    expect(cbs.onDragEnter).toHaveBeenCalledTimes(1)
    expect(cbs.onDragOver).toHaveBeenCalledTimes(1)
  })

  it('reads the LATEST callbacks from getCallbacks each tick', () => {
    // Simulates a re-rendered DropTarget whose props changed: registry
    // entry stays the same but callbacks pointed-to switch.
    _resetDragRegistryForTesting()
    const target = mkTarget({ x: 0, y: 0, w: 10, h: 5 })
    const onDragOver1 = vi.fn()
    const onDragOver2 = vi.fn()
    let current: DropTargetCallbacks = { onDragOver: onDragOver1 }
    registerDropTarget({
      getNode: () => target,
      getCallbacks: () => current,
    })
    startDrag(undefined)
    tickDrag(5, 2)
    expect(onDragOver1).toHaveBeenCalledTimes(1)
    expect(onDragOver2).not.toHaveBeenCalled()
    // "Re-render" by swapping the bundle.
    current = { onDragOver: onDragOver2 }
    tickDrag(6, 3)
    expect(onDragOver1).toHaveBeenCalledTimes(1)
    expect(onDragOver2).toHaveBeenCalledTimes(1)
  })

  it('skips entries whose getNode returns null (transient detach)', () => {
    _resetDragRegistryForTesting()
    const onDragEnter = vi.fn()
    registerDropTarget({
      getNode: () => null,
      getCallbacks: () => ({ onDragEnter }),
    })
    startDrag(undefined)
    tickDrag(5, 2)
    expect(onDragEnter).not.toHaveBeenCalled()
  })
})
