import type React from 'react'
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react'
import type { Except } from 'type-fest'
import type { DOMElement } from '../../dom.js'
import type { KeyboardEvent } from '../../events/keyboard-event.js'
import type { MouseDownEvent } from '../../events/mouse-event.js'
import type { PasteEvent } from '../../events/paste-event.js'
import { useDeclaredCursor } from '../../hooks/use-declared-cursor.js'
import type { Color } from '../../styles.js'
import Box, { type Props as BoxProps } from '../Box.js'
import Text from '../Text.js'
import { cellColumnAt, splitLines } from './caret-math.js'
import {
  type Action,
  type ReducerOptions,
  type TextInputState,
  initialState,
  reduce,
  selectedText,
  selectionOrCaretRange,
} from './state.js'

export type TextInputProps = Except<
  BoxProps,
  // We own keyboard / paste / mouse handling — overriding these
  // would conflict with caret math.
  'onKeyDown' | 'onPaste' | 'onMouseDown' | 'onClick'
> & {
  /** Controlled value. When set, the input reflects this exact string
   *  and fires `onChange` on edits. Caller is responsible for echoing
   *  the change back via state. */
  value?: string
  /** Initial value when uncontrolled. Ignored after mount; use `value`
   *  for controlled mode if you need to reset. */
  defaultValue?: string
  /** Called whenever the buffer changes — typing, pastes, deletes,
   *  undo, redo. The new value is the only argument. */
  onChange?: (value: string) => void
  /** Called when the user submits: Enter in single-line, Ctrl+Enter
   *  in multiline. Receives the current value. */
  onSubmit?: (value: string) => void
  /** Called on Escape. Useful for closing modals / cancelling edits. */
  onCancel?: () => void
  /** Allow newlines in the buffer. Enter inserts a newline; Ctrl+Enter
   *  submits. Default false (single-line). */
  multiline?: boolean
  /** Cap on buffer length in characters. Default unlimited. */
  maxLength?: number
  /** Render placeholder text dimmed when the buffer is empty. */
  placeholder?: string
  /** When true, all rendered chars are replaced with `passwordChar`.
   *  Caret math still operates on the real buffer. Default false. */
  password?: boolean
  /** Mask character used when `password` is true. Default `'•'`. */
  passwordChar?: string
  /** Disable input. The input still renders + claims focus, but
   *  keystrokes don't mutate the buffer. */
  disabled?: boolean
  /** Selection background color. Default the renderer's terminal-default
   *  selection background (typically inverse). */
  selectionColor?: Color
  /** Auto-focus on mount. */
  autoFocus?: boolean
  /** Maximum history entries kept for undo/redo. Default 100. */
  historyCap?: number
}

/**
 * Editable text input. Single-line by default; pass `multiline` for a
 * multi-line buffer with ↑/↓ navigation. Built on top of the pure
 * state machine in `./state.ts` — every keystroke routes through a
 * reducer action, and the React component is a thin shell around it.
 *
 * **Editing**: type, Backspace, Delete, ←/→, ↑/↓ (multiline), Home,
 * End, Ctrl+←/→ (word nav), Ctrl+W (delete word back), Ctrl+U (delete
 * line back), Ctrl+K (delete line forward), Ctrl+A (select all),
 * Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (undo/redo).
 *
 * **Selection**: Shift+arrows extend; mouse drag extends; click
 * positions the caret.
 *
 * **Submit**: Enter (single-line) or Ctrl+Enter (multiline). Escape
 * triggers `onCancel`.
 *
 * **Paste**: short pastes (≤ `<AlternateScreen pasteThreshold>`,
 * default 32 chars) come through as a stream of keystrokes — they
 * feel like typing. Long pastes fire the `onPaste` event the input
 * subscribes to internally and become one undo step.
 *
 * **Caret rendering**: the real terminal cursor is positioned at the
 * caret via `useDeclaredCursor`, so IME composition popups + screen
 * readers follow correctly. No synthetic caret glyph.
 */
export default function TextInput({
  value,
  defaultValue,
  onChange,
  onSubmit,
  onCancel,
  multiline = false,
  maxLength,
  placeholder,
  password = false,
  passwordChar = '•',
  disabled = false,
  selectionColor = 'cyan',
  autoFocus = false,
  historyCap,
  ...boxProps
}: PropsWithChildren<TextInputProps>): React.ReactNode {
  const isControlled = value !== undefined
  const [state, dispatch] = useReducer(
    reducerWithOpts,
    isControlled ? value : (defaultValue ?? ''),
    initialState,
  )

  // Keep reducer options stable per-render so the dispatcher and
  // event handlers see consistent multiline/maxLength even mid-event.
  const opts: ReducerOptions = useMemo(
    () => ({ multiline, maxLength, historyCap }),
    [multiline, maxLength, historyCap],
  )
  const optsRef = useRef(opts)
  optsRef.current = opts

  // Bridge: dispatch invokes reduce with the current opts ref.
  // The reducer signature React expects is (state, action) => state,
  // so we close over the latest opts via the ref.
  function reducerWithOpts(s: TextInputState, a: Action): TextInputState {
    return reduce(s, a, optsRef.current)
  }

  // Controlled mode: when external `value` differs from internal,
  // reset state to the new value. Clearing history is intentional —
  // arbitrary external sets shouldn't be undoable as if they were
  // user edits. Skip when undefined (uncontrolled).
  useEffect(() => {
    if (!isControlled) return
    if (value === state.value) return
    dispatch({ type: 'setCaret', charIdx: value!.length, extend: false })
    // Resetting the buffer requires bypassing the reducer because
    // the reducer doesn't have a "set value" action (intentionally —
    // we want all edits to flow through actions). Reset by replacing
    // through a synthetic insertText action that selects-all-then-
    // inserts. Simpler: dispatch select-all then insert.
    // Actually: do this via a one-shot init reset.
    dispatch({ type: 'selectAll' })
    dispatch({ type: 'insertText', text: value!, isPaste: false })
  }, [isControlled, value, state.value])

  // Fire onChange when internal value changes from a user action. Skip
  // when value matches the controlled prop (echo). useRef avoids
  // re-firing during the controlled-sync above.
  const lastReportedValue = useRef(state.value)
  useEffect(() => {
    if (state.value === lastReportedValue.current) return
    lastReportedValue.current = state.value
    onChange?.(state.value)
  }, [state.value, onChange])

  // ── Focus + caret-cursor declaration ───────────────────────────────

  const ref = useRef<DOMElement>(null)

  // Compute caret screen position (cell coords) from the current state.
  // For multiline, walk lines; for single-line, just cellColumnAt.
  const caretLineCol = useMemo(() => {
    const lines = splitLines(state.value)
    let acc = 0
    for (let i = 0; i < lines.length; i++) {
      const len = lines[i]!.length
      if (state.caret <= acc + len) {
        const within = state.caret - acc
        return { line: i, col: cellColumnAt(lines[i]!, within) }
      }
      acc += len + 1 // +1 for '\n'
    }
    return { line: lines.length - 1, col: cellColumnAt(lines[lines.length - 1]!, 0) }
  }, [state.value, state.caret])

  // Declare the terminal cursor at the caret. The hook only renders
  // the cursor when `active` is true — we're active iff this is the
  // focused element. We detect focus via DOM-node attribute checked
  // each render (focus changes trigger a re-render via FocusContext
  // already, since we'll wrap with autoFocus / tabIndex below).
  // Position is element-relative; the renderer adds the box's screen
  // origin.
  const isFocused = ref.current?.focusManager?.activeElement === ref.current
  const cursorRef = useDeclaredCursor({
    line: caretLineCol.line,
    column: caretLineCol.col,
    active: isFocused,
  })

  // Merge cursorRef into our element ref. The hook's ref is for the
  // cursor anchor; ours is for the focus-state read. They go to the
  // same node.
  const setRef = useCallback(
    (node: DOMElement | null) => {
      ref.current = node
      cursorRef(node)
    },
    [cursorRef],
  )

  // ── Event handlers ────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled) return
      const action = keyToAction(e, multiline)
      if (action === 'submit') {
        e.preventDefault()
        onSubmit?.(state.value)
        return
      }
      if (action === 'cancel') {
        e.preventDefault()
        onCancel?.()
        return
      }
      if (action) {
        e.preventDefault()
        dispatch(action)
        return
      }
      // Plain printable keystroke: insert. KeyboardEvent.key is the
      // literal char for printables; multi-char `key` means a special
      // key we already handled above. Skip ctrl/meta combos (consumer
      // may bind them at a higher level).
      if (e.ctrl || e.meta) return
      const ch = e.key
      if (!ch || ch.length !== 1) return
      // Drop non-printable (control) chars silently. Anything < 0x20
      // except \t we treat as non-text. (Newlines come through as
      // `key === 'return'` and are handled in keyToAction's submit
      // branch above.)
      const code = ch.charCodeAt(0)
      if (code < 0x20 && ch !== '\t') return
      e.preventDefault()
      dispatch({ type: 'insertText', text: ch })
    },
    [disabled, multiline, onSubmit, onCancel, state.value],
  )

  const handlePaste = useCallback(
    (e: PasteEvent) => {
      if (disabled) return
      e.preventDefault()
      dispatch({ type: 'insertText', text: e.text, isPaste: true })
    },
    [disabled],
  )

  // Click positions the caret. Mouse drag (gesture-captured) extends
  // selection. Multiline click translates the (col, row) cell coords
  // into a char index by walking lines.
  const handleMouseDown = useCallback(
    (e: MouseDownEvent) => {
      if (disabled) return
      const idx = clickToCharIndex(state.value, e.localCol, e.localRow, password, passwordChar)
      dispatch({ type: 'setCaret', charIdx: idx, extend: e.shiftKey })
      e.captureGesture({
        onMove(m) {
          const newIdx = clickToCharIndex(
            state.value,
            m.col - (e.col - e.localCol),
            m.row - (e.row - e.localRow),
            password,
            passwordChar,
          )
          dispatch({ type: 'setCaret', charIdx: newIdx, extend: true })
        },
      })
    },
    [disabled, state.value, password, passwordChar],
  )

  // ── Rendering ─────────────────────────────────────────────────────

  // Compute lines-with-selection-highlights for rendering.
  const renderedLines = useMemo(
    () => renderLines(state, { password, passwordChar, selectionColor, placeholder }),
    [state, password, passwordChar, selectionColor, placeholder],
  )

  return (
    <Box
      {...boxProps}
      ref={setRef}
      tabIndex={boxProps.tabIndex ?? 0}
      autoFocus={autoFocus}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onMouseDown={handleMouseDown}
      flexDirection="column"
    >
      {renderedLines}
    </Box>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Map a KeyboardEvent into a reducer action, or 'submit' / 'cancel'
 *  for non-action signals, or null for unhandled. Pure function so the
 *  binding table is auditable in one place. */
function keyToAction(
  e: KeyboardEvent,
  multiline: boolean,
): Action | 'submit' | 'cancel' | null {
  const k = e.key
  // Submit / cancel
  if (k === 'return') {
    if (multiline && !e.ctrl) {
      return { type: 'insertText', text: '\n' }
    }
    return 'submit'
  }
  if (k === 'escape') return 'cancel'

  // Movement
  if (k === 'left') {
    return {
      type: 'moveCaret',
      direction: e.ctrl ? 'wordLeft' : 'left',
      extend: e.shift,
    }
  }
  if (k === 'right') {
    return {
      type: 'moveCaret',
      direction: e.ctrl ? 'wordRight' : 'right',
      extend: e.shift,
    }
  }
  if (k === 'up') return { type: 'moveCaret', direction: 'up', extend: e.shift }
  if (k === 'down') return { type: 'moveCaret', direction: 'down', extend: e.shift }
  if (k === 'home') {
    return {
      type: 'moveCaret',
      direction: e.ctrl ? 'docStart' : 'home',
      extend: e.shift,
    }
  }
  if (k === 'end') {
    return {
      type: 'moveCaret',
      direction: e.ctrl ? 'docEnd' : 'end',
      extend: e.shift,
    }
  }

  // Deletion
  if (k === 'backspace') {
    if (e.ctrl) return { type: 'deleteWordBackward' }
    return { type: 'deleteBackward' }
  }
  if (k === 'delete') return { type: 'deleteForward' }

  // Ctrl shortcuts. KeyboardEvent.key for ctrl+letter is the lowercase
  // letter (parsed from the parsedKey.name in the Kitty/standard
  // protocol); shift modifies it to uppercase or stays lowercase
  // depending on terminal encoding — accept both.
  if (e.ctrl && !e.shift) {
    if (k === 'w') return { type: 'deleteWordBackward' }
    if (k === 'u') return { type: 'deleteLineBackward' }
    if (k === 'k') return { type: 'deleteLineForward' }
    if (k === 'a') return { type: 'selectAll' }
    if (k === 'z') return { type: 'undo' }
    if (k === 'y') return { type: 'redo' }
  }
  if (e.ctrl && e.shift && (k === 'z' || k === 'Z')) return { type: 'redo' }

  return null
}

type RenderOpts = {
  password: boolean
  passwordChar: string
  selectionColor: Color
  placeholder: string | undefined
}

function maskValue(value: string, password: boolean, passwordChar: string): string {
  if (!password) return value
  // Preserve newlines (don't mask line breaks).
  return value
    .split('\n')
    .map((line) => passwordChar.repeat([...line].length))
    .join('\n')
}

/** Render the buffer as one Text per line, splitting each line into
 *  pre-selection / selection / post-selection segments so the
 *  selection highlight is visible. Empty buffer renders the
 *  placeholder dimmed. */
function renderLines(state: TextInputState, opts: RenderOpts): React.ReactNode {
  const { password, passwordChar, selectionColor, placeholder } = opts

  if (state.value === '' && placeholder) {
    return (
      <Text dim wrap="truncate-end">
        {placeholder}
      </Text>
    )
  }

  const display = maskValue(state.value, password, passwordChar)
  const lines = splitLines(display)
  const [selStart, selEnd] = selectionOrCaretRange(state)

  // Walk lines, emitting per-line segments. Convert flat selection
  // indices into per-line indices so each line's highlight is rendered
  // correctly.
  let offset = 0
  return lines.map((line, lineIdx) => {
    const lineLen = line.length
    const localStart = clamp(selStart - offset, 0, lineLen)
    const localEnd = clamp(selEnd - offset, 0, lineLen)
    offset += lineLen + 1 // +1 for the consumed '\n'

    if (localStart === localEnd) {
      // No selection on this line — render plain.
      return (
        <Text key={lineIdx} wrap="wrap">
          {line || ' '}
        </Text>
      )
    }

    const before = line.slice(0, localStart)
    const sel = line.slice(localStart, localEnd) || ' '
    const after = line.slice(localEnd)
    return (
      <Text key={lineIdx} wrap="wrap">
        {before}
        <Text backgroundColor={selectionColor}>{sel}</Text>
        {after}
      </Text>
    )
  })
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}

/** Translate a click within the input (local cell coords) into a char
 *  index. For multiline, walks lines; for single-line, just one line. */
function clickToCharIndex(
  value: string,
  col: number,
  row: number,
  password: boolean,
  passwordChar: string,
): number {
  const display = maskValue(value, password, passwordChar)
  const lines = splitLines(display)
  const targetLine = clamp(row, 0, lines.length - 1)
  const line = lines[targetLine]!
  // We need real-buffer index, not display-buffer. For non-password
  // mode, display === value, no translation needed. For password mode,
  // display has 1 mask-char per buffer-char; column-to-char-index
  // works the same.
  let acc = 0
  for (let i = 0; i < targetLine; i++) acc += lines[i]!.length + 1

  // cell column → char index within the line
  let cellAcc = 0
  for (let i = 0; i < line.length; i++) {
    const w = cellColumnAt(line[i]!, 1)
    if (cellAcc + w > col) return acc + i
    cellAcc += w
    if (cellAcc === col) return acc + i + 1
  }
  return acc + line.length
}
