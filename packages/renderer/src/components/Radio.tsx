import type React from 'react'
import { type PropsWithChildren, useCallback } from 'react'
import type { Except } from 'type-fest'
import type { KeyboardEvent } from '../events/keyboard-event.js'
import useFocus from '../hooks/use-focus.js'
import type { Color } from '../styles.js'
import Box, { type Props as BoxProps } from './Box.js'
import Text from './Text.js'

export type RadioProps<T> = Except<BoxProps, 'onClick' | 'onKeyDown'> & {
  /** The currently selected value across the entire radio group. The
   *  caller owns this state — usually a `useState<T>` shared across
   *  every Radio in the group. */
  current: T
  /** This radio's value. Selected iff `value === current`. */
  value: T
  /** Called when the user activates this radio (mouse-click, Enter,
   *  or Space). Always fires with this radio's `value` — radios are
   *  mutually-exclusive, so "activate" means "set the group to me". */
  onChange: (value: T) => void
  /** Label text rendered next to the radio. Optional — when omitted,
   *  the consumer can place arbitrary children inside instead (the
   *  whole row is the click target either way). */
  label?: string
  /** Text color while focused. Default `'cyan'`. */
  focusColor?: Color
}

/**
 * Focusable radio button — mutually-exclusive selection bound to a
 * value. Renders `(x)` / `( )` plus an optional label.
 *
 * Compose multiple Radios with the same `current` + `onChange`
 * (typically a shared `useState<T>`) for a radio group. Use
 * `<FocusGroup>` around them for arrow-key navigation.
 *
 * **Focus model:** identical to `<Checkbox>` — defaults
 * `claimFocusOnClick={false}` so mouse-clicks toggle without
 * stealing focus from a peer (e.g. a `<TextInput>` showing a live
 * preview). Tab navigation is unaffected.
 *
 * **Activation semantics:** unlike Checkbox, a Radio is single-state
 * (selected or not). Click / Enter / Space always sets the group to
 * this radio's value — there's no "uncheck" by clicking the same
 * radio again, since you'd be left with no selected value. To clear
 * a group, set `current` to a value none of the radios match.
 *
 * @example
 *   const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md')
 *   <FocusGroup direction="row">
 *     <Radio current={size} value="sm" onChange={setSize} label="small" />
 *     <Radio current={size} value="md" onChange={setSize} label="medium" />
 *     <Radio current={size} value="lg" onChange={setSize} label="large" />
 *   </FocusGroup>
 */
export default function Radio<T>({
  current,
  value,
  onChange,
  label,
  focusColor = 'cyan',
  children,
  ...boxProps
}: PropsWithChildren<RadioProps<T>>): React.ReactNode {
  const { autoFocus, ...rest } = boxProps
  const { ref, isFocused } = useFocus({ autoFocus })
  const checked = current === value

  const activate = useCallback(() => {
    // Radio activation is idempotent — clicking an already-selected
    // radio fires onChange again with the same value. Caller's
    // setState is a no-op for unchanged values, so this is fine.
    onChange(value)
  }, [onChange, value])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'return' || e.key === ' ') {
        e.preventDefault()
        activate()
      }
    },
    [activate],
  )

  return (
    <Box
      {...rest}
      ref={ref}
      tabIndex={rest.tabIndex ?? 0}
      claimFocusOnClick={rest.claimFocusOnClick ?? false}
      onClick={activate}
      onKeyDown={handleKeyDown}
    >
      <Text color={isFocused ? focusColor : undefined} bold={isFocused}>
        {`(${checked ? 'x' : ' '})`}
      </Text>
      {label !== undefined && (
        <Text color={isFocused ? focusColor : undefined} bold={isFocused}>
          {` ${label}`}
        </Text>
      )}
      {children}
    </Box>
  )
}
