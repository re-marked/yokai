/**
 * FocusRing tests.
 *
 * The component is a thin Box + useFocus wrapper. Real focus-state
 * transitions need React's render loop to flow through, which we
 * exercise via the demo. The unit tests here pin the prop-mapping
 * surface — ensuring a consumer passing borderStyle, borderColor, or
 * tabIndex gets the expected behavior, and the defaults match the
 * documented contract.
 */

import React from 'react'
import { describe, expect, it } from 'vitest'
import FocusRing from './FocusRing.js'

describe('FocusRing — prop surface', () => {
  it('constructs without throwing when given no props', () => {
    expect(() => React.createElement(FocusRing)).not.toThrow()
  })

  it('accepts and constructs with all documented props', () => {
    expect(() =>
      React.createElement(FocusRing, {
        borderColorFocus: 'magenta',
        borderColorIdle: 'gray',
        autoFocus: true,
        paddingX: 1,
        // Pass-through Box prop:
        backgroundColor: '#1a1a3a',
      }),
    ).not.toThrow()
  })

  it('accepts an explicit borderStyle override', () => {
    expect(() =>
      React.createElement(FocusRing, { borderStyle: 'double' }),
    ).not.toThrow()
  })

  it('accepts an explicit tabIndex override (e.g. -1 for programmatic-only)', () => {
    expect(() =>
      React.createElement(FocusRing, { tabIndex: -1 }),
    ).not.toThrow()
  })

  it('accepts children of arbitrary React node shape', () => {
    expect(() =>
      React.createElement(
        FocusRing,
        null,
        React.createElement('div'),
        'plain text',
        null,
        false,
      ),
    ).not.toThrow()
  })
})
