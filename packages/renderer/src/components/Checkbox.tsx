import type React from 'react'
import { type PropsWithChildren, useCallback } from 'react'
import type { Except } from 'type-fest'
import type { KeyboardEvent } from '../events/keyboard-event.js'
import useFocus from '../hooks/use-focus.js'
import type { Color } from '../styles.js'
import Box, { type Props as BoxProps } from './Box.js'
import Text from './Text.js'

export type CheckboxProps = Except<BoxProps, 'onClick' | 'onKeyDown'> & {
  /** Current checked state. Caller-controlled — Checkbox calls
   *  `onChange(!checked)` and the caller flips its state. */
  checked: boolean
  /** Called when the user toggles the checkbox via mouse-click,
   *  Enter, or Space. */
  onChange: (checked: boolean) => void
  /** Label text rendered next to the box. Optional — when omitted,
   *  the consumer can place arbitrary children inside instead (the
   *  whole row is the click target either way). */
  label?: string
  /** Text color while focused. Default `'cyan'`. */
  focusColor?: Color
}

/**
 * Focusable checkbox — renders `[x]` / `[ ]` plus an optional label,
 * the whole row is the click target.
 *
 * **Focus model:** defaults `claimFocusOnClick={false}` so mouse
 * clicks toggle the box without stealing focus from a peer (e.g. a
 * `<TextInput>` showing a live preview that depends on focus). Tab
 * navigation is unaffected — the checkbox still focuses on Tab. To
 * get the standard "click takes focus" behavior, pass
 * `claimFocusOnClick={true}` explicitly.
 *
 * **Keyboard:** Enter or Space toggles the focused checkbox. Tab /
 * Shift+Tab moves focus in / out (or use `<FocusGroup>` for arrow-
 * key navigation between siblings).
 *
 * **Visual:** `[x]` checked, `[ ]` unchecked, label color shifts to
 * `focusColor` (default cyan) while focused. For full control over
 * the rendered glyph or layout, omit `label` and pass children.
 *
 * @example
 *   const [checked, setChecked] = useState(false)
 *   <Checkbox checked={checked} onChange={setChecked} label="Accept" />
 */
export default function Checkbox({
  checked,
  onChange,
  label,
  focusColor = 'cyan',
  children,
  ...boxProps
}: PropsWithChildren<CheckboxProps>): React.ReactNode {
  // Extract autoFocus so it goes through useFocus only (passing it to
  // Box too would route through reconciler.commitMount AND the hook
  // — both call focusManager.focus(node), redundant in practice but
  // confusing to read).
  const { autoFocus, ...rest } = boxProps
  const { ref, isFocused } = useFocus({ autoFocus })

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 'return' = Enter; ' ' = Space. Both are the universal toggle
      // keys on a checkbox. preventDefault stops parent FocusGroups
      // from interpreting Space as something else (no parent does
      // today, but the convention reads cleaner).
      if (e.key === 'return' || e.key === ' ') {
        e.preventDefault()
        onChange(!checked)
      }
    },
    [checked, onChange],
  )

  return (
    <Box
      {...rest}
      ref={ref}
      tabIndex={rest.tabIndex ?? 0}
      claimFocusOnClick={rest.claimFocusOnClick ?? false}
      onClick={() => onChange(!checked)}
      onKeyDown={handleKeyDown}
    >
      <Text color={isFocused ? focusColor : undefined} bold={isFocused}>
        {`[${checked ? 'x' : ' '}]`}
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
