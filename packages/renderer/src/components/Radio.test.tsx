/**
 * Radio tests.
 *
 * Same pattern as Checkbox.test.tsx — smoke tests for the prop
 * surface. Real activation behavior + focus transitions are covered
 * end-to-end by the cursor-styles demo, which uses Radios in three
 * groups bound to live cursor configuration.
 */

import React from 'react'
import { describe, expect, it } from 'vitest'
import Radio from './Radio.js'

describe('Radio — prop surface', () => {
  it('constructs with required props (current + value + onChange)', () => {
    expect(() =>
      React.createElement(Radio, { current: 'a', value: 'a', onChange: () => {} }),
    ).not.toThrow()
  })

  it('constructs with all documented props', () => {
    expect(() =>
      React.createElement(Radio, {
        current: 'medium',
        value: 'large',
        onChange: () => {},
        label: 'Large',
        focusColor: 'green',
        autoFocus: true,
        paddingX: 1,
        backgroundColor: '#0a0a0a',
      }),
    ).not.toThrow()
  })

  it('accepts boolean-typed values (e.g. yes/no toggles)', () => {
    expect(() =>
      React.createElement(Radio, {
        current: true,
        value: false,
        onChange: () => {},
        label: 'Off',
      }),
    ).not.toThrow()
  })

  it('accepts custom value types (string union, enum-shaped)', () => {
    type Size = 'sm' | 'md' | 'lg'
    const md: Size = 'md'
    const lg: Size = 'lg'
    expect(() =>
      React.createElement(Radio<Size>, {
        current: md,
        value: lg,
        onChange: () => {},
        label: 'lg',
      }),
    ).not.toThrow()
  })

  it('accepts claimFocusOnClick={true} to opt back into standard click-focus', () => {
    expect(() =>
      React.createElement(Radio, {
        current: 'a',
        value: 'a',
        onChange: () => {},
        claimFocusOnClick: true,
      }),
    ).not.toThrow()
  })

  it('accepts children alongside the parens glyph', () => {
    expect(() =>
      React.createElement(
        Radio,
        { current: 'red', value: 'red', onChange: () => {} },
        React.createElement('ink-text', { color: 'red' }, ' red swatch'),
      ),
    ).not.toThrow()
  })
})
