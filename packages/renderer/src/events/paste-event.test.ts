/**
 * PasteEvent class tests. The smart-split logic in App.handleParsedInput
 * is tested separately at the App level; this file pins the event
 * shape contract — bubbles, cancelable, target, propagation — that
 * consumers attach onPaste handlers against.
 */

import { describe, expect, it } from 'vitest'
import { PasteEvent } from './paste-event.js'

describe('PasteEvent', () => {
  it('exposes the pasted text on .text', () => {
    const e = new PasteEvent('hello world')
    expect(e.text).toBe('hello world')
  })

  it('preserves multiline content verbatim — consumers sanitise', () => {
    const text = 'line one\nline two\nline three'
    const e = new PasteEvent(text)
    expect(e.text).toBe(text)
  })

  it('handles empty paste (some terminals send paste-end with no content)', () => {
    const e = new PasteEvent('')
    expect(e.text).toBe('')
  })

  it('has type "paste"', () => {
    expect(new PasteEvent('x').type).toBe('paste')
  })

  it('bubbles by default', () => {
    expect(new PasteEvent('x').bubbles).toBe(true)
  })

  it('is cancelable by default', () => {
    expect(new PasteEvent('x').cancelable).toBe(true)
  })

  it('preventDefault flips defaultPrevented', () => {
    const e = new PasteEvent('x')
    expect(e.defaultPrevented).toBe(false)
    e.preventDefault()
    expect(e.defaultPrevented).toBe(true)
  })

  it('stopPropagation stops bubbling but lets sibling handlers on same target run', () => {
    // Mirrors DOM semantics that stopPropagation halts ancestor dispatch
    // but doesn't suppress same-target handlers; stopImmediatePropagation
    // is the stronger one. We don't have a dispatcher mock here — just
    // verify the flag plumbing.
    const e = new PasteEvent('x')
    e.stopPropagation()
    expect(e._isPropagationStopped()).toBe(true)
    expect(e._isImmediatePropagationStopped()).toBe(false)
  })

  it('stopImmediatePropagation also stops propagation', () => {
    const e = new PasteEvent('x')
    e.stopImmediatePropagation()
    expect(e._isPropagationStopped()).toBe(true)
    expect(e._isImmediatePropagationStopped()).toBe(true)
  })

  it('timeStamp is set at construction', () => {
    const before = performance.now()
    const e = new PasteEvent('x')
    const after = performance.now()
    expect(e.timeStamp).toBeGreaterThanOrEqual(before)
    expect(e.timeStamp).toBeLessThanOrEqual(after)
  })
})
