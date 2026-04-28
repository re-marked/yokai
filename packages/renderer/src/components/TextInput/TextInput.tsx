import type React from 'react'
import {
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { Except } from 'type-fest'
import type { DOMElement } from '../../dom.js'
import type { KeyboardEvent } from '../../events/keyboard-event.js'
import type { MouseDownEvent } from '../../events/mouse-event.js'
import type { PasteEvent } from '../../events/paste-event.js'
import { useDeclaredCursor } from '../../hooks/use-declared-cursor.js'
import { LayoutEdge } from '../../layout/node.js'
import type { Color } from '../../styles.js'
import Box, { type Props as BoxProps } from '../Box.js'
import FocusContext from '../FocusContext.js'
import Text from '../Text.js'
import { cellColumnAt, splitLines } from './caret-math.js'
import { scrollToKeepCaretVisible, sliceRowByCells } from './scroll-math.js'
import {
  type Action,
  type ReducerOptions,
  type TextInputState,
  initialState,
  reduce,
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
  /**
   * Border color when the input is focused. Default `'cyan'`.
   *
   * The input swaps its `borderColor` for this value while focused,
   * and reverts to the idle color (whatever was passed via
   * `borderColor`, or the terminal default) on blur. Requires a
   * `borderStyle` to be set — without a border there's nothing to
   * color, so the swap is a no-op.
   *
   * To opt out of the focus-color swap (e.g. when focus is indicated
   * elsewhere — a status bar, a sibling chrome element), pass the
   * same value as `borderColor`. Setting both to the same value
   * keeps the border static across focus transitions.
   */
  borderColorFocus?: Color
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
  borderColorFocus = 'cyan',
  autoFocus = false,
  historyCap,
  ...boxProps
}: PropsWithChildren<TextInputProps>): React.ReactNode {
  const isControlled = value !== undefined

  // optsRef MUST be declared before useReducer. On a render that has
  // queued dispatches, useReducer drains them by calling the reducer
  // immediately — which reads optsRef.current. With the ref declared
  // AFTER useReducer in render order, the reducer would hit a TDZ
  // ("Cannot access 'optsRef' before initialization") when the React
  // Compiler-transformed code re-enters this scope.
  const optsRef = useRef<ReducerOptions>({ multiline, maxLength, historyCap })
  // Mutate inline so the next dispatch sees the latest options without
  // a re-renders-update-state-before-effects round trip.
  optsRef.current = { multiline, maxLength, historyCap }

  // Reducer bridge — the React-shape (state, action) => state, closing
  // over the ref so opts changes propagate to the next dispatch.
  const reducerWithOpts = useCallback(
    (s: TextInputState, a: Action): TextInputState => reduce(s, a, optsRef.current),
    [],
  )

  const [state, dispatch] = useReducer(
    reducerWithOpts,
    isControlled ? value : (defaultValue ?? ''),
    initialState,
  )

  // Controlled-mode loop avoidance: track the last value we reported
  // (or were initialized with). The two effects below use this single
  // ref to avoid the classic ping-pong where:
  //   - user types → state updates → onChange fires
  //   - parent setState updates the prop
  //   - sync sees prop !== state, resets state to prop
  //   - onChange fires again with the reset value
  //   - parent setState again → infinite loop at 60Hz.
  //
  // The ref records "what the parent's value prop should be after
  // they echo our last report." Sync only fires when the prop differs
  // from THAT — meaning the parent set value externally, not just
  // hasn't echoed yet. onChange skips if state matches the ref —
  // meaning the change came FROM a sync, not a user edit.
  const lastReportedValue = useRef<string>(isControlled ? value! : (defaultValue ?? ''))

  // Sync internal state when the parent SETS value to something we
  // didn't just report. Deps are [value] only — state.value would
  // re-fire this effect on every keystroke, defeating the loop guard.
  // The closure-captured state.value is fine for the no-op skip
  // because if state.value already matches the new prop value, we
  // don't need to dispatch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: state.value is read for an idempotency check only — including it would re-fire the sync on every keystroke and break the controlled-mode loop guard above.
  useEffect(() => {
    if (!isControlled) return
    if (value === lastReportedValue.current) return // we reported this
    if (value === state.value) return // already in sync somehow
    lastReportedValue.current = value!
    // Replace selection-all with insert; clears history because an
    // external set isn't a user-undoable edit.
    dispatch({ type: 'selectAll' })
    dispatch({ type: 'insertText', text: value!, isPaste: false })
  }, [isControlled, value])

  // Fire onChange when internal state diverges from the last reported
  // value (i.e. user-initiated change). Skip if the change came from
  // the controlled-sync effect above — that path updates
  // lastReportedValue first, so this comparison short-circuits.
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

  // ── Scroll: keep caret visible inside the visible window ───────────
  //
  // Two axes; only one applies per mode. Single-line: horizontal,
  // measured in cells across the inner content area. Multiline:
  // vertical, measured in rows across the inner content area.
  //
  // Inner content size is read from yoga via measureInnerSize() each
  // commit. Read in useLayoutEffect so the value is fresh enough to
  // matter for the next render — yoga's value is one frame stale
  // (calculateLayout runs after this effect), but for typing the lag
  // is invisible because each keystroke triggers another render that
  // catches up.
  const [inner, setInner] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const node = ref.current
    if (!node?.yogaNode) return
    const measured = measureInnerSize(node)
    if (measured.width !== inner.width || measured.height !== inner.height) {
      setInner(measured)
    }
  })

  const [scrollX, setScrollX] = useState(0)
  const [scrollY, setScrollY] = useState(0)
  const allLines = useMemo(() => splitLines(state.value), [state.value])
  // Total content size. Single-line: cells of the only line.
  // Multiline: row count.
  const contentWidth = multiline ? 0 : cellColumnAt(allLines[0]!, allLines[0]!.length)
  const contentHeight = allLines.length

  // Adjust scroll on every state/size change so the caret stays in
  // view. useEffect (not useLayoutEffect) so the next paint reflects
  // both the new caret AND the new scroll in the same render — React
  // batches the setState here with the original cause.
  useEffect(() => {
    if (!multiline && inner.width > 0) {
      const next = scrollToKeepCaretVisible({
        scroll: scrollX,
        caretPos: caretLineCol.col,
        windowSize: inner.width,
        contentSize: Math.max(contentWidth, caretLineCol.col + 1),
      })
      if (next !== scrollX) setScrollX(next)
    }
    if (multiline && inner.height > 0) {
      const next = scrollToKeepCaretVisible({
        scroll: scrollY,
        caretPos: caretLineCol.line,
        windowSize: inner.height,
        contentSize: Math.max(contentHeight, caretLineCol.line + 1),
      })
      if (next !== scrollY) setScrollY(next)
    }
  }, [
    multiline,
    inner.width,
    inner.height,
    caretLineCol.col,
    caretLineCol.line,
    contentWidth,
    contentHeight,
    scrollX,
    scrollY,
  ])

  // Subscribe to focus state via FocusContext. The earlier shortcut
  // `ref.current.focusManager?.activeElement === ref.current` was
  // always false because `focusManager` lives only on the root node
  // (per `dom.ts` — "any node can reach it by walking parentNode").
  // That left `isFocused` permanently false, so the terminal cursor
  // never declared as active and the user saw no caret. Subscribe via
  // the manager so we re-render when this element gains/loses focus.
  const focusCtx = useContext(FocusContext)
  const [isFocused, setIsFocused] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || !focusCtx) return
    setIsFocused(focusCtx.manager.activeElement === node)
    return focusCtx.manager.subscribeToFocus(node, setIsFocused)
  }, [focusCtx])

  // Declare the terminal cursor at the caret, adjusted for the active
  // axis's scroll offset so it lands on the visible cell. The hook
  // only renders the cursor when `active` is true — we're active iff
  // this is the focused element.
  //
  // Only one axis is maintained per mode (scrollX in single-line,
  // scrollY in multiline) — the inactive axis stays at zero. But if
  // `multiline` is toggled at runtime AFTER scrolling, the previously
  // active axis still holds its last offset. Subtracting unconditionally
  // would push the cursor declaration to the wrong (sometimes negative)
  // coordinate. Gate by mode so the inactive axis is never applied.
  const cursorRef = useDeclaredCursor({
    line: caretLineCol.line - (multiline ? scrollY : 0),
    column: caretLineCol.col - (multiline ? 0 : scrollX),
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
      // literal char for printables; multi-character special keys
      // (e.g. 'left', 'backspace') would have been handled above by
      // keyToAction. Skip ctrl/meta combos — consumer may bind them
      // at a higher level.
      if (e.ctrl || e.meta) return
      const ch = e.key
      if (!ch) return
      // Single-grapheme guard. Counted in CODE POINTS, not UTF-16
      // units, so non-BMP printables (most emoji — '😀'.length is 2
      // because of the surrogate pair, but [...'😀'].length is 1)
      // pass through. Multi-grapheme `key` strings (the named special
      // keys above) are filtered out here.
      if ([...ch].length !== 1) return
      // Drop non-printable (control) chars silently. Anything < 0x20
      // except \t we treat as non-text. Surrogate-pair emoji land far
      // above 0x20 in their full code point, so this gate doesn't
      // affect them. (Newlines come through as `key === 'return'`
      // and are handled in keyToAction's submit branch above.)
      const code = ch.codePointAt(0) ?? 0
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
      // Manually focus on press. The default click-to-focus path lives
      // in `dispatchClick` (hit-test.ts) — but capturing a gesture in
      // onMouseDown short-circuits the release-side dispatchClick (see
      // App.handleMouseEvent's release branch: when `activeGesture` is
      // set it fires onUp and returns early, never calling onClickAt).
      // Without this manual call, clicking a TextInput would never
      // focus it, and Tab would be the only way to land in.
      const node = ref.current
      if (focusCtx && node) focusCtx.manager.focus(node)

      // Click coords are local to the Box (0-indexed from its top-left
      // INCLUDING padding/border). The visible content starts at
      // (scrollX, scrollY) within the buffer, so add the scroll
      // offsets to land on the right buffer position. We don't try
      // to subtract padding/border here — the renderer's hit-test
      // already accounts for box layout, so localCol/Row are
      // relative to the OUTER box. If the user adds padding, click
      // accuracy near the edges will be off by the padding amount;
      // documented limitation.
      const idx = clickToCharIndex(
        state.value,
        e.localCol + scrollX,
        e.localRow + scrollY,
        password,
        passwordChar,
      )
      dispatch({ type: 'setCaret', charIdx: idx, extend: e.shiftKey })
      e.captureGesture({
        onMove(m) {
          const newIdx = clickToCharIndex(
            state.value,
            m.col - (e.col - e.localCol) + scrollX,
            m.row - (e.row - e.localRow) + scrollY,
            password,
            passwordChar,
          )
          dispatch({ type: 'setCaret', charIdx: newIdx, extend: true })
        },
      })
    },
    [disabled, state.value, password, passwordChar, scrollX, scrollY, focusCtx],
  )

  // ── Rendering ─────────────────────────────────────────────────────

  // Compute lines-with-selection-highlights for rendering. Pass
  // scroll offsets so the rendered slice matches the cursor's
  // declared position (single-line: skip `scrollX` cells of the only
  // line; multiline: skip `scrollY` rows).
  const renderedLines = useMemo(
    () =>
      renderLines(state, {
        password,
        passwordChar,
        selectionColor,
        placeholder,
        scrollX,
        scrollY,
        innerWidth: inner.width,
        innerHeight: inner.height,
        multiline,
      }),
    [
      state,
      password,
      passwordChar,
      selectionColor,
      placeholder,
      scrollX,
      scrollY,
      inner.width,
      inner.height,
      multiline,
    ],
  )

  // Focus-aware border color. Extract idle borderColor from boxProps so
  // we can compute the swapped value cleanly (avoids passing both via
  // spread + override). When focused, paint with `borderColorFocus`;
  // otherwise fall through to whatever the consumer provided as the
  // idle `borderColor` (or terminal default if undefined). The swap is
  // a no-op when no `borderStyle` is set — there's no border to color.
  const { borderColor: idleBorderColor, ...restBoxProps } = boxProps
  const renderedBorderColor = isFocused ? borderColorFocus : idleBorderColor

  return (
    <Box
      {...restBoxProps}
      ref={setRef}
      tabIndex={restBoxProps.tabIndex ?? 0}
      autoFocus={autoFocus}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onMouseDown={handleMouseDown}
      flexDirection="column"
      borderColor={renderedBorderColor}
    >
      {renderedLines}
    </Box>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Map a KeyboardEvent into a reducer action, or 'submit' / 'cancel'
 *  for non-action signals, or null for unhandled. Pure function so the
 *  binding table is auditable in one place. */
function keyToAction(e: KeyboardEvent, multiline: boolean): Action | 'submit' | 'cancel' | null {
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
  scrollX: number
  scrollY: number
  innerWidth: number
  innerHeight: number
  multiline: boolean
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
  const {
    password,
    passwordChar,
    selectionColor,
    placeholder,
    scrollX,
    scrollY,
    innerWidth,
    innerHeight,
    multiline,
  } = opts

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

  // Multiline: window the line array vertically. Single-line: window
  // the only line horizontally. Both fall back to the full buffer when
  // measurements aren't available yet (first render).
  const visibleLines =
    multiline && innerHeight > 0 ? lines.slice(scrollY, scrollY + innerHeight) : lines
  const lineOffset = multiline && innerHeight > 0 ? scrollY : 0

  // Walk lines, emitting per-line segments. Convert flat selection
  // indices into per-line indices. Index-as-key is correct here: lines
  // have no stable identity, the buffer re-renders on every keystroke,
  // and a stable key per slot avoids unmount-on-edit.
  let charOffset = 0
  for (let i = 0; i < lineOffset; i++) {
    charOffset += (lines[i]?.length ?? 0) + 1 // +1 for '\n'
  }
  return visibleLines.map((line, lineIdx) => {
    // For single-line, slice horizontally by cells.
    const visibleLine =
      !multiline && innerWidth > 0 ? sliceRowByCells(line, scrollX, innerWidth) : line
    const lineLen = line.length
    const localStart = clamp(selStart - charOffset, 0, lineLen)
    const localEnd = clamp(selEnd - charOffset, 0, lineLen)
    charOffset += lineLen + 1

    // Selection range in the SLICED visible line. Convert by walking
    // cells; for the simple no-wide-char path this is just char-index
    // math after subtracting scrollX. For correctness with wide chars
    // we'd compute via the same cell math sliceRowByCells uses, but
    // for v1 the simple path is correct enough — selection rendering
    // on a horizontally-scrolled wide char is a v2 nice-to-have.
    const visStart = !multiline && innerWidth > 0 ? Math.max(0, localStart - scrollX) : localStart
    const visEnd = !multiline && innerWidth > 0 ? Math.max(0, localEnd - scrollX) : localEnd

    if (visStart === visEnd) {
      return (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: see comment above
          key={lineIdx}
          wrap="truncate-end"
        >
          {visibleLine || ' '}
        </Text>
      )
    }

    const before = visibleLine.slice(0, visStart)
    const sel = visibleLine.slice(visStart, visEnd) || ' '
    const after = visibleLine.slice(visEnd)
    return (
      <Text
        // biome-ignore lint/suspicious/noArrayIndexKey: see comment above
        key={lineIdx}
        wrap="truncate-end"
      >
        {before}
        <Text backgroundColor={selectionColor}>{sel}</Text>
        {after}
      </Text>
    )
  })
}

/**
 * Read the inner content area (width × height) from a Box's yoga
 * node, subtracting border + padding insets. Returns 0/0 when the
 * yoga layout isn't available yet (first render before
 * calculateLayout, or detached node).
 */
function measureInnerSize(node: DOMElement): { width: number; height: number } {
  const yoga = node.yogaNode
  if (!yoga) return { width: 0, height: 0 }
  const w = yoga.getComputedWidth()
  const h = yoga.getComputedHeight()
  if (!w || !h) return { width: 0, height: 0 }
  const padL = yoga.getComputedPadding(LayoutEdge.Left) ?? 0
  const padR = yoga.getComputedPadding(LayoutEdge.Right) ?? 0
  const padT = yoga.getComputedPadding(LayoutEdge.Top) ?? 0
  const padB = yoga.getComputedPadding(LayoutEdge.Bottom) ?? 0
  const brL = yoga.getComputedBorder(LayoutEdge.Left) ?? 0
  const brR = yoga.getComputedBorder(LayoutEdge.Right) ?? 0
  const brT = yoga.getComputedBorder(LayoutEdge.Top) ?? 0
  const brB = yoga.getComputedBorder(LayoutEdge.Bottom) ?? 0
  return {
    width: Math.max(0, Math.floor(w - padL - padR - brL - brR)),
    height: Math.max(0, Math.floor(h - padT - padB - brT - brB)),
  }
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
