import { createContext } from 'react'
import type { DOMElement } from '../dom'
import type { Color } from '../styles'
import type { CursorStyle } from '../termio/dec'

export type CursorDeclaration = {
  /** Display column (terminal cell width) within the declared node */
  readonly relativeX: number
  /** Line number within the declared node */
  readonly relativeY: number
  /** The ink-box DOMElement whose yoga layout provides the absolute origin */
  readonly node: DOMElement
  /**
   * Optional cursor shape. When set, ink emits DECSCUSR alongside the
   * position write to override the terminal's configured shape. When
   * undefined, the terminal's configured shape wins (no DECSCUSR
   * write). When the declaration goes back to undefined-style after
   * having had one, ink emits `CSI 0 SP q` to restore the default —
   * so consumers don't poison the user's shell with their last
   * cursor config.
   */
  readonly style?: CursorStyle
  /**
   * Optional blink override. Pairs with `style` in the DECSCUSR
   * sequence (style + blink combine into one of 6 codes). Setting
   * either alone defaults the other (`style ?? 'block'`,
   * `blink ?? true`) — DECSCUSR can't set just one half.
   */
  readonly blink?: boolean
  /**
   * Optional cursor color override. When set, ink emits OSC 12 at
   * the same point in the render path as DECSCUSR. When undefined,
   * the terminal's configured color wins. When a declaration that
   * had a color is replaced by one without (or cleared), ink emits
   * OSC 112 to reset.
   *
   * Support varies by terminal — xterm, iTerm2, kitty, alacritty,
   * Windows Terminal, VS Code all honor it. Older terminals ignore
   * the sequence (no harm done).
   *
   * `ansi256(N)` colors aren't supported by OSC 12 syntax — they
   * pass through and the terminal will likely ignore them. Use
   * `'#rrggbb'`, `'rgb(r,g,b)'`, or named colors.
   */
  readonly color?: Color
}

/**
 * Setter for the declared cursor position.
 *
 * The optional second argument makes `null` a conditional clear: the
 * declaration is only cleared if the currently-declared node matches
 * `clearIfNode`. This makes the hook safe for sibling components
 * (e.g. list items) that transfer focus among themselves — without the
 * node check, a newly-unfocused item's clear could clobber a
 * newly-focused sibling's set depending on layout-effect order.
 */
export type CursorDeclarationSetter = (
  declaration: CursorDeclaration | null,
  clearIfNode?: DOMElement | null,
) => void

const CursorDeclarationContext = createContext<CursorDeclarationSetter>(() => {})

export default CursorDeclarationContext
