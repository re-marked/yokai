import { describe, expect, it, vi } from 'vitest'
import { type DOMElement, appendChildNode, createNode } from '../dom.js'
import { dispatchMouseDown, dispatchWheel } from '../hit-test.js'
import { nodeCache } from '../node-cache.js'
import { MouseDownEvent } from './mouse-event.js'

// Tests work directly against nodeCache rather than going through the
// full render pipeline — dispatchMouseDown only needs hit-test, and
// hit-test only needs nodeCache rects. Letting us test dispatch logic
// in isolation from layout / render.
function setRect(node: DOMElement, x: number, y: number, w: number, h: number): void {
  nodeCache.set(node, { x, y, width: w, height: h, top: y })
}

describe('MouseDownEvent', () => {
  it('starts with no captured handlers', () => {
    const e = new MouseDownEvent(0, 0, 0)
    expect(e._capturedHandlers).toBeNull()
  })

  it('captureGesture stores the handler set', () => {
    const e = new MouseDownEvent(0, 0, 0)
    const onMove = vi.fn()
    const onUp = vi.fn()
    e.captureGesture({ onMove, onUp })
    expect(e._capturedHandlers).toEqual({ onMove, onUp })
  })

  it('captureGesture allows partial handlers (onMove only)', () => {
    const e = new MouseDownEvent(0, 0, 0)
    const onMove = vi.fn()
    e.captureGesture({ onMove })
    expect(e._capturedHandlers?.onMove).toBe(onMove)
    expect(e._capturedHandlers?.onUp).toBeUndefined()
  })

  it('keeps the first captureGesture call when called multiple times', () => {
    // The press is claimed once. Later calls during the same dispatch are
    // ignored so an ancestor cannot steal a descendant's gesture.
    const e = new MouseDownEvent(0, 0, 0)
    const first = vi.fn()
    const second = vi.fn()
    e.captureGesture({ onMove: first })
    e.captureGesture({ onMove: second })
    expect(e._capturedHandlers?.onMove).toBe(first)
  })

  it('reports when a gesture has been captured', () => {
    const e = new MouseDownEvent(0, 0, 0)
    expect(e.gestureCaptured).toBe(false)
    e.captureGesture({ onMove: vi.fn() })
    expect(e.gestureCaptured).toBe(true)
  })

  describe('captureGestureTentatively', () => {
    it('captures handlers and marks the event as tentative', () => {
      const e = new MouseDownEvent(0, 0, 0)
      const onMove = vi.fn()
      e.captureGestureTentatively({ onMove })
      expect(e.gestureCaptured).toBe(true)
      expect(e.gestureTentative).toBe(true)
      expect(e._capturedHandlers?.onMove).toBe(onMove)
    })

    it('confirmed capture is NOT tentative', () => {
      const e = new MouseDownEvent(0, 0, 0)
      e.captureGesture({ onMove: vi.fn() })
      expect(e.gestureTentative).toBe(false)
    })

    it('first-call-wins applies across confirmed and tentative', () => {
      // Tentative-then-confirmed: tentative wins, stays tentative.
      const e1 = new MouseDownEvent(0, 0, 0)
      const tentMove = vi.fn()
      const confMove = vi.fn()
      e1.captureGestureTentatively({ onMove: tentMove })
      e1.captureGesture({ onMove: confMove })
      expect(e1._capturedHandlers?.onMove).toBe(tentMove)
      expect(e1.gestureTentative).toBe(true)

      // Confirmed-then-tentative: confirmed wins, stays confirmed.
      const e2 = new MouseDownEvent(0, 0, 0)
      e2.captureGesture({ onMove: confMove })
      e2.captureGestureTentatively({ onMove: tentMove })
      expect(e2._capturedHandlers?.onMove).toBe(confMove)
      expect(e2.gestureTentative).toBe(false)
    })
  })

  describe('modifier key decoding', () => {
    it('reads shift from button bit 0x04', () => {
      expect(new MouseDownEvent(0, 0, 0).shiftKey).toBe(false)
      expect(new MouseDownEvent(0, 0, 0x04).shiftKey).toBe(true)
    })

    it('reads alt from button bit 0x08', () => {
      expect(new MouseDownEvent(0, 0, 0).altKey).toBe(false)
      expect(new MouseDownEvent(0, 0, 0x08).altKey).toBe(true)
    })

    it('reads ctrl from button bit 0x10', () => {
      expect(new MouseDownEvent(0, 0, 0).ctrlKey).toBe(false)
      expect(new MouseDownEvent(0, 0, 0x10).ctrlKey).toBe(true)
    })

    it('decodes multiple modifiers simultaneously', () => {
      // 0x04 (shift) | 0x10 (ctrl) = 0x14
      const e = new MouseDownEvent(0, 0, 0x14)
      expect(e.shiftKey).toBe(true)
      expect(e.altKey).toBe(false)
      expect(e.ctrlKey).toBe(true)
    })
  })
})

describe('dispatchMouseDown', () => {
  it('returns null when nothing is under the cursor', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 10, 5)
    expect(dispatchMouseDown(root, 100, 100, 0)).toBeNull()
  })

  it('returns null when the hit element has no onMouseDown handler', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 10, 5)
    const child = createNode('ink-box')
    appendChildNode(root, child)
    setRect(child, 0, 0, 5, 5)
    expect(dispatchMouseDown(root, 2, 2, 0)).toBeNull()
  })

  it('returns null when the handler runs but does not call captureGesture', () => {
    // Handler ran (we can verify via the spy) but didn't capture →
    // dispatch returns null and the App falls through to default
    // selection behavior.
    const root = createNode('ink-root')
    setRect(root, 0, 0, 10, 5)
    const child = createNode('ink-box')
    appendChildNode(root, child)
    setRect(child, 0, 0, 5, 5)
    const handler = vi.fn()
    child._eventHandlers = { onMouseDown: handler }

    const result = dispatchMouseDown(root, 2, 2, 0)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(result).toBeNull()
  })

  it('returns the captured handlers when the handler calls captureGesture', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 10, 5)
    const child = createNode('ink-box')
    appendChildNode(root, child)
    setRect(child, 0, 0, 5, 5)
    const onMove = vi.fn()
    const onUp = vi.fn()
    child._eventHandlers = {
      onMouseDown: (e: MouseDownEvent) => e.captureGesture({ onMove, onUp }),
    }

    const result = dispatchMouseDown(root, 2, 2, 0)
    expect(result?.handlers.onMove).toBe(onMove)
    expect(result?.handlers.onUp).toBe(onUp)
  })

  it('bubbles to ancestors when the deepest hit has no handler', () => {
    // Press lands on grandchild (no handler). Bubbles to child (no
    // handler). Bubbles to root (has handler). Root's handler fires.
    const root = createNode('ink-root')
    setRect(root, 0, 0, 10, 5)
    const child = createNode('ink-box')
    appendChildNode(root, child)
    setRect(child, 0, 0, 5, 5)
    const grandchild = createNode('ink-box')
    appendChildNode(child, grandchild)
    setRect(grandchild, 1, 1, 2, 2)

    const handler = vi.fn()
    root._eventHandlers = { onMouseDown: handler }

    dispatchMouseDown(root, 2, 2, 0)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('fires both child and ancestor handlers in bubble order', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 10, 5)
    const child = createNode('ink-box')
    appendChildNode(root, child)
    setRect(child, 0, 0, 5, 5)

    const order: string[] = []
    child._eventHandlers = { onMouseDown: () => order.push('child') }
    root._eventHandlers = { onMouseDown: () => order.push('root') }

    dispatchMouseDown(root, 2, 2, 0)
    expect(order).toEqual(['child', 'root'])
  })

  it('stops bubbling after the first captured gesture', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 10, 5)
    const child = createNode('ink-box')
    appendChildNode(root, child)
    setRect(child, 0, 0, 5, 5)

    const childMove = vi.fn()
    const rootMove = vi.fn()
    const rootHandler = vi.fn((e: MouseDownEvent) => e.captureGesture({ onMove: rootMove }))
    child._eventHandlers = {
      onMouseDown: (e: MouseDownEvent) => e.captureGesture({ onMove: childMove }),
    }
    root._eventHandlers = { onMouseDown: rootHandler }

    const result = dispatchMouseDown(root, 2, 2, 0)
    expect(rootHandler).not.toHaveBeenCalled()
    expect(result?.handlers.onMove).toBe(childMove)
  })

  it('stops bubbling when a handler calls stopImmediatePropagation', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 10, 5)
    const child = createNode('ink-box')
    appendChildNode(root, child)
    setRect(child, 0, 0, 5, 5)

    const rootHandler = vi.fn()
    child._eventHandlers = {
      onMouseDown: (e: MouseDownEvent) => e.stopImmediatePropagation(),
    }
    root._eventHandlers = { onMouseDown: rootHandler }

    dispatchMouseDown(root, 2, 2, 0)
    expect(rootHandler).not.toHaveBeenCalled()
  })

  it('still returns captured handlers when stopImmediatePropagation is also called', () => {
    // Capture and stopPropagation are independent — a handler can both
    // claim the gesture AND prevent ancestors from seeing the press.
    const root = createNode('ink-root')
    setRect(root, 0, 0, 10, 5)
    const child = createNode('ink-box')
    appendChildNode(root, child)
    setRect(child, 0, 0, 5, 5)
    const onMove = vi.fn()
    child._eventHandlers = {
      onMouseDown: (e: MouseDownEvent) => {
        e.captureGesture({ onMove })
        e.stopImmediatePropagation()
      },
    }
    const rootHandler = vi.fn()
    root._eventHandlers = { onMouseDown: rootHandler }

    const result = dispatchMouseDown(root, 2, 2, 0)
    expect(rootHandler).not.toHaveBeenCalled()
    expect(result?.handlers.onMove).toBe(onMove)
  })

  it('CapturedGesture carries tentative=false for confirmed captures', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 10, 5)
    root._eventHandlers = {
      onMouseDown: (e: MouseDownEvent) => e.captureGesture({ onMove: vi.fn() }),
    }
    const result = dispatchMouseDown(root, 2, 2, 0)
    expect(result?.tentative).toBe(false)
  })

  it('CapturedGesture carries tentative=true for tentative captures', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 10, 5)
    root._eventHandlers = {
      onMouseDown: (e: MouseDownEvent) => e.captureGestureTentatively({ onMove: vi.fn() }),
    }
    const result = dispatchMouseDown(root, 2, 2, 0)
    expect(result?.tentative).toBe(true)
  })

  it('passes (col, row, button) into the event for handlers to read', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 10, 5)
    let captured: MouseDownEvent | null = null
    root._eventHandlers = {
      onMouseDown: (e: MouseDownEvent) => {
        captured = e
      },
    }

    dispatchMouseDown(root, 7, 3, 0x08)
    expect(captured).not.toBeNull()
    expect((captured as unknown as MouseDownEvent).col).toBe(7)
    expect((captured as unknown as MouseDownEvent).row).toBe(3)
    expect((captured as unknown as MouseDownEvent).altKey).toBe(true)
  })

  it('sets localCol / localRow relative to each handler element', () => {
    // Press at screen (5, 3). Child's rect starts at (3, 2), so
    // child's handler sees local (2, 1). Root's rect starts at (0, 0),
    // so root's handler sees local (5, 3).
    const root = createNode('ink-root')
    setRect(root, 0, 0, 10, 5)
    const child = createNode('ink-box')
    appendChildNode(root, child)
    setRect(child, 3, 2, 5, 3)

    const captures: { who: string; localCol: number; localRow: number }[] = []
    child._eventHandlers = {
      onMouseDown: (e: MouseDownEvent) =>
        captures.push({ who: 'child', localCol: e.localCol, localRow: e.localRow }),
    }
    root._eventHandlers = {
      onMouseDown: (e: MouseDownEvent) =>
        captures.push({ who: 'root', localCol: e.localCol, localRow: e.localRow }),
    }

    dispatchMouseDown(root, 5, 3, 0)
    expect(captures).toEqual([
      { who: 'child', localCol: 2, localRow: 1 },
      { who: 'root', localCol: 5, localRow: 3 },
    ])
  })
})

describe('dispatchWheel', () => {
  it('scrolls the nearest ScrollBox ancestor under the cursor', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 20, 10)
    const outer = createNode('ink-box')
    outer.attributes.scrollBox = true
    outer.attributes.scrollWheelStep = 3
    outer.scrollTop = 0
    appendChildNode(root, outer)
    setRect(outer, 0, 0, 20, 10)
    const child = createNode('ink-box')
    appendChildNode(outer, child)
    setRect(child, 1, 1, 10, 4)

    expect(dispatchWheel(root, 2, 2, 'down')).toBe(true)
    expect(outer.pendingScrollDelta).toBe(3)
    expect(outer.stickyScroll).toBe(false)
  })

  it('uses the innermost ScrollBox when ScrollBoxes are nested', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 20, 10)
    const outer = createNode('ink-box')
    outer.attributes.scrollBox = true
    outer.attributes.scrollWheelStep = 3
    outer.scrollTop = 0
    appendChildNode(root, outer)
    setRect(outer, 0, 0, 20, 10)
    const inner = createNode('ink-box')
    inner.attributes.scrollBox = true
    inner.attributes.scrollWheelStep = 5
    inner.scrollTop = 0
    appendChildNode(outer, inner)
    setRect(inner, 1, 1, 10, 4)

    expect(dispatchWheel(root, 2, 2, 'down')).toBe(true)
    expect(inner.pendingScrollDelta).toBe(5)
    expect(outer.pendingScrollDelta).toBeUndefined()
  })

  it('falls through to an ancestor ScrollBox when the inner one disables wheel', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 20, 10)
    const outer = createNode('ink-box')
    outer.attributes.scrollBox = true
    outer.attributes.scrollWheelStep = 3
    outer.scrollTop = 0
    appendChildNode(root, outer)
    setRect(outer, 0, 0, 20, 10)
    const inner = createNode('ink-box')
    inner.attributes.scrollBox = true
    inner.attributes.disableWheel = true
    inner.attributes.scrollWheelStep = 5
    inner.scrollTop = 0
    appendChildNode(outer, inner)
    setRect(inner, 1, 1, 10, 4)

    expect(dispatchWheel(root, 2, 2, 'down')).toBe(true)
    expect(inner.pendingScrollDelta).toBeUndefined()
    expect(outer.pendingScrollDelta).toBe(3)
  })

  it('does not scroll when no ScrollBox ancestor is under the cursor', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 20, 10)
    const child = createNode('ink-box')
    appendChildNode(root, child)
    setRect(child, 1, 1, 10, 4)

    expect(dispatchWheel(root, 2, 2, 'down')).toBe(false)
  })

  it('normalizes wheel-up at the top to no pending delta', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 20, 10)
    const box = createNode('ink-box')
    box.attributes.scrollBox = true
    box.attributes.scrollWheelStep = 3
    box.scrollTop = 0
    appendChildNode(root, box)
    setRect(box, 0, 0, 20, 10)

    expect(dispatchWheel(root, 2, 2, 'up')).toBe(true)
    expect(box.pendingScrollDelta).toBeUndefined()
  })

  it('falls back to the default wheel step when configured step is invalid', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 20, 10)
    const box = createNode('ink-box')
    box.attributes.scrollBox = true
    box.attributes.scrollWheelStep = -1
    box.scrollTop = 0
    appendChildNode(root, box)
    setRect(box, 0, 0, 20, 10)

    expect(dispatchWheel(root, 2, 2, 'down')).toBe(true)
    expect(box.pendingScrollDelta).toBe(3)
  })

  it('notifies ScrollBox subscribers when wheel changes pending scroll', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 20, 10)
    const box = createNode('ink-box')
    box.attributes.scrollBox = true
    box.attributes.scrollWheelStep = 3
    box.scrollTop = 0
    const listener = vi.fn()
    box.scrollListeners = new Set([listener])
    appendChildNode(root, box)
    setRect(box, 0, 0, 20, 10)

    expect(dispatchWheel(root, 2, 2, 'down')).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not notify subscribers for a wheel that leaves scroll state unchanged', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 20, 10)
    const box = createNode('ink-box')
    box.attributes.scrollBox = true
    box.attributes.scrollWheelStep = 3
    box.scrollTop = 0
    const listener = vi.fn()
    box.scrollListeners = new Set([listener])
    appendChildNode(root, box)
    setRect(box, 0, 0, 20, 10)

    expect(dispatchWheel(root, 2, 2, 'up')).toBe(true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies subscribers when wheel only breaks sticky state', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 20, 10)
    const box = createNode('ink-box')
    box.attributes.scrollBox = true
    box.attributes.scrollWheelStep = 3
    box.scrollTop = 0
    box.stickyScroll = true
    const listener = vi.fn()
    box.scrollListeners = new Set([listener])
    appendChildNode(root, box)
    setRect(box, 0, 0, 20, 10)

    expect(dispatchWheel(root, 2, 2, 'up')).toBe(true)
    expect(box.pendingScrollDelta).toBeUndefined()
    expect(box.stickyScroll).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
