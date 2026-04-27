import type React from 'react'
import type { PropsWithChildren } from 'react'
import type { Except } from 'type-fest'
import useFocus from '../hooks/use-focus.js'
import type { Color } from '../styles.js'
import Box, { type Props as BoxProps } from './Box.js'

export type FocusRingProps = Except<BoxProps, 'ref'> & {
  /**
   * Color used for the focus indicator. Default `'cyan'`.
   *
   * The indicator is a `borderStyle: 'single'` box that swaps its
   * `borderColor` from `borderColorIdle` (default: undefined → terminal
   * default) to `borderColorFocus` (default: this color) when the
   * element gains focus. Set `borderStyle` yourself in props to use a
   * different style (`double`, `round`, `bold`); FocusRing only
   * defaults to `single` when no style is provided.
   */
  borderColorFocus?: Color
  /** Color of the border when NOT focused. Default: undefined (terminal
   *  default border color). */
  borderColorIdle?: Color
  /** Auto-focus this element on mount. Same semantics as `useFocus`. */
  autoFocus?: boolean
}

/**
 * Focusable Box with a built-in focus-visible border indicator. Pair
 * with `<FocusGroup>` for keyboard-navigable lists and menus.
 *
 * Why a wrapper component instead of a Box prop or HOC: Box is the
 * lowest-level layout primitive and shouldn't carry focus-tracking
 * state for non-focusable consumers. FocusRing is the opt-in form
 * — pay for the focus subscription only when you want focus chrome.
 *
 * @example
 *   <FocusGroup direction="column">
 *     {items.map((item) => (
 *       <FocusRing key={item.id} paddingX={1}>
 *         <Text>{item.label}</Text>
 *       </FocusRing>
 *     ))}
 *   </FocusGroup>
 */
export default function FocusRing({
  borderColorFocus = 'cyan',
  borderColorIdle,
  autoFocus,
  children,
  ...boxProps
}: PropsWithChildren<FocusRingProps>): React.ReactNode {
  const { ref, isFocused } = useFocus({ autoFocus })

  // Default to a single-style border so the indicator has something
  // to colour. User-supplied borderStyle wins via the boxProps spread.
  const borderStyle = boxProps.borderStyle ?? 'single'
  const borderColor = isFocused ? borderColorFocus : borderColorIdle

  return (
    <Box
      {...boxProps}
      ref={ref}
      tabIndex={boxProps.tabIndex ?? 0}
      borderStyle={borderStyle}
      borderColor={borderColor}
    >
      {children}
    </Box>
  )
}
