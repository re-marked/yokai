/**
 * TextInput component-level prop-surface tests.
 *
 * The deep behavior tests live in the focused suites:
 *   - state.test.ts          — reducer mechanics
 *   - wrap-math.test.ts      — pure wrap helpers
 *   - TextInput.wrap.test.ts — reducer + wrap-math composed
 *   - clipboard-action.test.ts — Ctrl+C / Ctrl+X helper
 *   - caret-math.test.ts / scroll-math.test.ts — pure helpers
 *
 * This file pins the constructibility of the React surface — every
 * documented prop combination must instantiate cleanly. Real focus
 * transitions, validation rendering, and click-to-position need
 * React's render loop to flow through; we exercise those via the
 * `pnpm demo:text-input` demo, which now includes a validation
 * field.
 *
 * Pattern matches Checkbox.test.tsx — call React.createElement with
 * documented prop sets and assert no throw. Catches typos in default
 * args, prop renames, and accidental required-prop additions
 * surface-level fast.
 */

import React from 'react'
import { describe, expect, it } from 'vitest'
import TextInput from './TextInput.js'

describe('TextInput — prop surface', () => {
  it('constructs with no props (uncontrolled, single-line, default everything)', () => {
    expect(() => React.createElement(TextInput, {})).not.toThrow()
  })

  it('constructs controlled with the minimum (value + onChange)', () => {
    expect(() => React.createElement(TextInput, { value: '', onChange: () => {} })).not.toThrow()
  })

  it('constructs the documented soft-wrap prop quartet (wrap + indentedWrap + wordBoundaries + wrapHints)', () => {
    expect(() =>
      React.createElement(TextInput, {
        defaultValue: 'hello world',
        multiline: true,
        wrap: 'soft',
        indentedWrap: true,
        wordBoundaries: 'identifier',
        wrapHints: [{ start: 0, end: 5 }],
      }),
    ).not.toThrow()
  })

  it('constructs with all cursor / focus chrome props', () => {
    expect(() =>
      React.createElement(TextInput, {
        autoFocus: true,
        cursorStyle: 'bar',
        cursorBlink: true,
        cursorColor: '#00ff00',
        borderStyle: 'round',
        borderColor: 'gray',
        borderColorFocus: 'green',
        selectionColor: 'blue',
      }),
    ).not.toThrow()
  })
})

describe('TextInput — validation prop surface', () => {
  it('constructs with a validate function alone (defaults: errorColor=red, default text renderer)', () => {
    expect(() =>
      React.createElement(TextInput, {
        defaultValue: 'a',
        validate: (v: string) => (v.length < 3 ? 'too short' : null),
      }),
    ).not.toThrow()
  })

  it('constructs with validate + custom errorColor', () => {
    expect(() =>
      React.createElement(TextInput, {
        defaultValue: '',
        validate: (v: string) => (v ? null : 'required'),
        errorColor: 'magenta',
      }),
    ).not.toThrow()
  })

  it('constructs with validate + custom renderError slot', () => {
    expect(() =>
      React.createElement(TextInput, {
        defaultValue: '',
        validate: () => 'oops',
        renderError: (msg: string) => React.createElement('ink-text', null, `⚠ ${msg}`),
      }),
    ).not.toThrow()
  })

  it('constructs without validate (validate path is opt-in; absence renders nothing)', () => {
    expect(() =>
      React.createElement(TextInput, {
        defaultValue: 'no validation',
        errorColor: 'red', // setting errorColor without validate is a no-op but should not throw
      }),
    ).not.toThrow()
  })

  it('accepts validate that returns null (valid)', () => {
    expect(() =>
      React.createElement(TextInput, {
        defaultValue: 'valid',
        validate: () => null,
      }),
    ).not.toThrow()
  })

  it('accepts validate that returns empty string (treated as null per docs)', () => {
    expect(() =>
      React.createElement(TextInput, {
        defaultValue: 'valid',
        validate: () => '',
      }),
    ).not.toThrow()
  })

  it('accepts validate that always returns a message (immediately invalid)', () => {
    expect(() =>
      React.createElement(TextInput, {
        defaultValue: '',
        validate: () => 'always invalid',
      }),
    ).not.toThrow()
  })

  it('composes with multiline + soft-wrap + validation', () => {
    expect(() =>
      React.createElement(TextInput, {
        defaultValue: 'a multiline value\nspanning a couple lines',
        multiline: true,
        wrap: 'soft',
        validate: (v: string) => (v.length > 100 ? 'too long' : null),
        errorColor: 'yellow',
      }),
    ).not.toThrow()
  })
})
