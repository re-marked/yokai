import { describe, expect, it } from 'vitest'
import { INITIAL_STATE, parseMultipleKeypresses } from './parse-keypress.js'

describe('parseMultipleKeypresses mouse wheel', () => {
  it('preserves SGR wheel coordinates on the ParsedKey', () => {
    const [items] = parseMultipleKeypresses(INITIAL_STATE, '\x1b[<65;12;4M')

    expect(items).toEqual([
      expect.objectContaining({
        kind: 'key',
        name: 'wheeldown',
        mouse: {
          button: 65,
          col: 12,
          row: 4,
        },
      }),
    ])
  })

  it('preserves X10 wheel coordinates on the ParsedKey', () => {
    const [items] = parseMultipleKeypresses(INITIAL_STATE, '\x1b[M`%#')

    expect(items).toEqual([
      expect.objectContaining({
        kind: 'key',
        name: 'wheelup',
        mouse: {
          button: 64,
          col: 5,
          row: 3,
        },
      }),
    ])
  })
})
