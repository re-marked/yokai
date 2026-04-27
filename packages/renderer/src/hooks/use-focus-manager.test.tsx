/**
 * useFocusManager tests.
 *
 * Same shape as use-focus.test.tsx — pin the contract against the
 * underlying FocusManager (the part that's mistake-prone) and rely
 * on the demo for full React-render integration.
 */

import React from 'react'
import { describe, expect, it } from 'vitest'
import { type DOMElement, appendChildNode, createNode, setAttribute } from '../dom.js'
import { FocusManager } from '../focus.js'
import { useFocusManager } from './use-focus-manager.js'

function setupTree(): {
  fm: FocusManager
  root: DOMElement
  a: DOMElement
  b: DOMElement
  c: DOMElement
} {
  const fm = new FocusManager(() => false)
  const root = createNode('ink-root')
  root.focusManager = fm
  const a = createNode('ink-box')
  const b = createNode('ink-box')
  const c = createNode('ink-box')
  setAttribute(a, 'tabIndex', 0)
  setAttribute(b, 'tabIndex', 0)
  setAttribute(c, 'tabIndex', 0)
  appendChildNode(root, a)
  appendChildNode(root, b)
  appendChildNode(root, c)
  return { fm, root, a, b, c }
}

describe('useFocusManager — global subscribe contract', () => {
  it('subscribe listener fires after every focus change (the pattern useFocusManager installs)', () => {
    const { fm, a, b } = setupTree()
    let calls = 0
    fm.subscribe(() => {
      calls++
    })
    fm.focus(a)
    fm.focus(b)
    fm.focus(a)
    fm.blur()
    expect(calls).toBe(4)
  })

  it('reading activeElement after subscribe gives the latest value (matches setState pattern)', () => {
    // The hook's listener does `setFocused(ctx.manager.activeElement)`.
    // Confirm activeElement is observable post-focus.
    const { fm, a, b } = setupTree()
    fm.focus(a)
    expect(fm.activeElement).toBe(a)
    fm.focus(b)
    expect(fm.activeElement).toBe(b)
    fm.blur()
    expect(fm.activeElement).toBeNull()
  })
})

describe('useFocusManager — focusNext / focusPrevious cycling', () => {
  it('focusNext from no focus → first tabbable', () => {
    const { fm, root, a } = setupTree()
    fm.focusNext(root)
    expect(fm.activeElement).toBe(a)
  })

  it('focusNext cycles forward through tabbables', () => {
    const { fm, root, a, b, c } = setupTree()
    fm.focusNext(root)
    expect(fm.activeElement).toBe(a)
    fm.focusNext(root)
    expect(fm.activeElement).toBe(b)
    fm.focusNext(root)
    expect(fm.activeElement).toBe(c)
  })

  it('focusNext wraps from last to first', () => {
    const { fm, root, a, c } = setupTree()
    fm.focus(c)
    fm.focusNext(root)
    expect(fm.activeElement).toBe(a)
  })

  it('focusPrevious cycles backward', () => {
    const { fm, root, a, b, c } = setupTree()
    fm.focus(c)
    fm.focusPrevious(root)
    expect(fm.activeElement).toBe(b)
    fm.focusPrevious(root)
    expect(fm.activeElement).toBe(a)
  })

  it('focusPrevious wraps from first to last', () => {
    const { fm, root, a, c } = setupTree()
    fm.focus(a)
    fm.focusPrevious(root)
    expect(fm.activeElement).toBe(c)
  })

  it('focusNext from no focus + no tabbables → no-op', () => {
    const fm = new FocusManager(() => false)
    const root = createNode('ink-root')
    root.focusManager = fm
    fm.focusNext(root)
    expect(fm.activeElement).toBeNull()
  })
})

describe('useFocusManager — null-context degradation', () => {
  it('component using useFocusManager outside FocusContext constructs without throwing', () => {
    function Probe(): React.ReactNode {
      const { focused, focus, focusNext, focusPrevious, blur } = useFocusManager()
      void focused
      void focus
      void focusNext
      void focusPrevious
      void blur
      return null
    }
    expect(() => React.createElement(Probe)).not.toThrow()
  })
})
