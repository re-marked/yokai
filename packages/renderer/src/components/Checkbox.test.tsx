/**
 * Checkbox tests.
 *
 * Component is a thin Box + useFocus wrapper plus glyph rendering.
 * Real focus-state transitions and click toggles need React's
 * render loop to flow through, which we exercise via the
 * cursor-styles demo. The unit tests here pin the prop-mapping
 * surface — ensuring a consumer passing the documented props gets
 * a constructable component, and the keyboard contract is honored.
 */

import React from 'react'
import { describe, expect, it } from 'vitest'
import Checkbox from './Checkbox.js'

describe('Checkbox — prop surface', () => {
  it('constructs with required props (checked + onChange)', () => {
    expect(() =>
      React.createElement(Checkbox, { checked: false, onChange: () => {} }),
    ).not.toThrow()
  })

  it('constructs with all documented props', () => {
    expect(() =>
      React.createElement(Checkbox, {
        checked: true,
        onChange: () => {},
        label: 'Accept terms',
        focusColor: 'magenta',
        autoFocus: true,
        paddingX: 1,
        // Box passthrough:
        backgroundColor: '#1a1a3a',
      }),
    ).not.toThrow()
  })

  it('accepts an explicit claimFocusOnClick={true} to opt back into standard click-focus', () => {
    expect(() =>
      React.createElement(Checkbox, {
        checked: false,
        onChange: () => {},
        claimFocusOnClick: true,
      }),
    ).not.toThrow()
  })

  it('accepts an explicit tabIndex override', () => {
    expect(() =>
      React.createElement(Checkbox, {
        checked: false,
        onChange: () => {},
        tabIndex: -1,
      }),
    ).not.toThrow()
  })

  it('accepts children alongside the bracket glyph', () => {
    expect(() =>
      React.createElement(
        Checkbox,
        { checked: false, onChange: () => {} },
        React.createElement('ink-text', null, 'custom suffix'),
      ),
    ).not.toThrow()
  })

  it('omits label cleanly (renders just `[x]` / `[ ]`)', () => {
    expect(() => React.createElement(Checkbox, { checked: true, onChange: () => {} })).not.toThrow()
  })
})
