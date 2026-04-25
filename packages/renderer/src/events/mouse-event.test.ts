import { describe, expect, it, vi } from 'vitest'
import { type DOMElement, appendChildNode, createNode } from '../dom.js'
import { dispatchMouseDown } from '../hit-test.js'
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

  it('last captureGesture call wins when called multiple times', () => {
    // Matches web pointer-events setPointerCapture semantics — repeat
    // calls during the same press silently overwrite, no error.
    const e = new MouseDownEvent(0, 0, 0)
    const first = vi.fn()
    const second = vi.fn()
    e.captureGesture({ onMove: first })
    e.captureGesture({ onMove: second })
    expect(e._capturedHandlers?.onMove).toBe(second)
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
    expect(result?.onMove).toBe(onMove)
    expect(result?.onUp).toBe(onUp)
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
    expect(result?.onMove).toBe(onMove)
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
