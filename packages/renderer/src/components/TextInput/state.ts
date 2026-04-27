/**
 * TextInput state machine. Pure reducer: takes a state + action +
 * options, returns a new state. The React component is a thin shell
 * over this — every editing operation routes through `reduce`.
 *
 * Purity is the point. Drag/drop, focus, and resize all extracted
 * the same way; testability outweighs the indirection.
 */

import {
  charIndexAtLineCol,
  lineColAt,
  splitLines,
  wordBoundaryAfter,
  wordBoundaryBefore,
} from './caret-math.js'

/** Selection is anchor (where the user pressed) and focus (where they
 *  moved to). Either order — the helpers normalise via min/max. */
export type Selection = { anchor: number; focus: number }

/** Snapshot of the editable state for undo/redo. */
type HistoryEntry = {
  value: string
  caret: number
  selection: Selection | null
  /** Logical "kind" of the entry — consecutive entries of the same
   *  kind merge into one undo step (so 30 keystrokes are one undo,
   *  not 30). Insertions / deletes / paste each get their own kind so
   *  the boundaries between them are preserved. */
  kind: 'insert' | 'delete' | 'paste' | 'caret' | 'init'
}

export type TextInputState = {
  value: string
  /** Char index. Caret sits BEFORE the char at this index. */
  caret: number
  /** Active selection if user is shift-selecting or dragging. null
   *  when no range is selected (caret is just a position). */
  selection: Selection | null
  /** Past states for undo. Most recent at end. */
  history: HistoryEntry[]
  /** Pointer into history. Starts at history.length - 1 (current
   *  state). Undo decrements, redo increments. */
  historyIndex: number
}

export type ReducerOptions = {
  /** When true, '\n' inserts a newline in the buffer. When false,
   *  '\n' is dropped. Pasted newlines are converted to spaces in
   *  single-line mode (handled in the insertText action). */
  multiline: boolean
  /** Cap on buffer length. Insertions that would exceed it are
   *  truncated to fit. undefined = unlimited. */
  maxLength: number | undefined
  /** Maximum entries to keep in history. Older entries drop from
   *  the front. Default 100. */
  historyCap?: number
}

const DEFAULT_HISTORY_CAP = 100

export function initialState(value: string): TextInputState {
  return {
    value,
    caret: value.length,
    selection: null,
    history: [{ value, caret: value.length, selection: null, kind: 'init' }],
    historyIndex: 0,
  }
}

// ── Selection helpers ────────────────────────────────────────────────

function selectionRange(sel: Selection): [number, number] {
  return sel.anchor <= sel.focus ? [sel.anchor, sel.focus] : [sel.focus, sel.anchor]
}

function hasNonEmptySelection(state: TextInputState): boolean {
  if (!state.selection) return false
  const [a, b] = selectionRange(state.selection)
  return a !== b
}

// ── History helpers ──────────────────────────────────────────────────

/**
 * Push a snapshot to history, pruning anything past the current pointer
 * (a typed character after an undo discards the future). Mergeable
 * entries (same kind) replace the last entry instead of appending so
 * a run of typed chars is one undo step.
 */
function pushHistory(
  state: TextInputState,
  next: { value: string; caret: number; selection: Selection | null },
  kind: HistoryEntry['kind'],
  cap: number,
): { history: HistoryEntry[]; historyIndex: number } {
  const truncated = state.history.slice(0, state.historyIndex + 1)
  const last = truncated[truncated.length - 1]
  const entry: HistoryEntry = { ...next, kind }

  // Merge consecutive same-kind insert/delete entries into one undo
  // step so the user doesn't have to Ctrl+Z 30 times to undo a typed
  // word. Paste and caret-only changes always create a new entry.
  const mergeable =
    last !== undefined && (kind === 'insert' || kind === 'delete') && last.kind === kind
  const newHistory = mergeable ? [...truncated.slice(0, -1), entry] : [...truncated, entry]

  // Cap.
  const overflow = newHistory.length - cap
  const trimmed = overflow > 0 ? newHistory.slice(overflow) : newHistory

  return {
    history: trimmed,
    historyIndex: trimmed.length - 1,
  }
}

// ── Public action shape ──────────────────────────────────────────────

export type CaretMove =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'home'
  | 'end'
  | 'wordLeft'
  | 'wordRight'
  | 'docStart'
  | 'docEnd'

export type Action =
  | { type: 'insertText'; text: string; isPaste?: boolean }
  | { type: 'deleteBackward' }
  | { type: 'deleteForward' }
  | { type: 'deleteWordBackward' }
  | { type: 'deleteLineBackward' }
  | { type: 'deleteLineForward' }
  | { type: 'moveCaret'; direction: CaretMove; extend: boolean }
  | { type: 'setCaret'; charIdx: number; extend: boolean }
  | { type: 'selectAll' }
  | { type: 'undo' }
  | { type: 'redo' }

// ── Caret movement ───────────────────────────────────────────────────

function moveCaretIndex(buffer: string, current: number, direction: CaretMove): number {
  switch (direction) {
    case 'left':
      return Math.max(0, current - 1)
    case 'right':
      return Math.min(buffer.length, current + 1)
    case 'home': {
      const { line } = lineColAt(buffer, current)
      return charIndexAtLineCol(buffer, line, 0)
    }
    case 'end': {
      const { line } = lineColAt(buffer, current)
      const lines = splitLines(buffer)
      return charIndexAtLineCol(buffer, line, lines[line]?.length ?? 0)
    }
    case 'up': {
      const { line, col } = lineColAt(buffer, current)
      if (line === 0) return 0
      return charIndexAtLineCol(buffer, line - 1, col)
    }
    case 'down': {
      const { line, col } = lineColAt(buffer, current)
      const lines = splitLines(buffer)
      if (line >= lines.length - 1) return buffer.length
      return charIndexAtLineCol(buffer, line + 1, col)
    }
    case 'wordLeft':
      return wordBoundaryBefore(buffer, current)
    case 'wordRight':
      return wordBoundaryAfter(buffer, current)
    case 'docStart':
      return 0
    case 'docEnd':
      return buffer.length
  }
}

// ── The reducer ──────────────────────────────────────────────────────

export function reduce(
  state: TextInputState,
  action: Action,
  opts: ReducerOptions,
): TextInputState {
  const cap = opts.historyCap ?? DEFAULT_HISTORY_CAP

  switch (action.type) {
    case 'insertText': {
      let text = action.text
      if (!opts.multiline) {
        // Single-line: strip newlines (paste of a code block becomes
        // one long line). Carriage returns get the same treatment.
        text = text.replace(/[\r\n]+/g, ' ')
      }

      // Replace selection if any, otherwise insert at caret.
      const [start, end] = state.selection
        ? selectionRange(state.selection)
        : [state.caret, state.caret]

      // Apply maxLength: truncate the inserted text to fit.
      let nextValue = state.value.slice(0, start) + text + state.value.slice(end)
      if (opts.maxLength !== undefined && nextValue.length > opts.maxLength) {
        const room = Math.max(0, opts.maxLength - (state.value.length - (end - start)))
        const fitted = text.slice(0, room)
        nextValue = state.value.slice(0, start) + fitted + state.value.slice(end)
        text = fitted
      }
      const nextCaret = start + text.length
      const next = { value: nextValue, caret: nextCaret, selection: null }

      return {
        ...state,
        ...next,
        ...pushHistory(state, next, action.isPaste ? 'paste' : 'insert', cap),
      }
    }

    case 'deleteBackward': {
      // If something's selected, deleting backward removes the selection.
      if (hasNonEmptySelection(state)) {
        const [start, end] = selectionRange(state.selection!)
        const next = {
          value: state.value.slice(0, start) + state.value.slice(end),
          caret: start,
          selection: null,
        }
        return { ...state, ...next, ...pushHistory(state, next, 'delete', cap) }
      }
      if (state.caret === 0) return state
      const next = {
        value: state.value.slice(0, state.caret - 1) + state.value.slice(state.caret),
        caret: state.caret - 1,
        selection: null,
      }
      return { ...state, ...next, ...pushHistory(state, next, 'delete', cap) }
    }

    case 'deleteForward': {
      if (hasNonEmptySelection(state)) {
        const [start, end] = selectionRange(state.selection!)
        const next = {
          value: state.value.slice(0, start) + state.value.slice(end),
          caret: start,
          selection: null,
        }
        return { ...state, ...next, ...pushHistory(state, next, 'delete', cap) }
      }
      if (state.caret === state.value.length) return state
      const next = {
        value: state.value.slice(0, state.caret) + state.value.slice(state.caret + 1),
        caret: state.caret,
        selection: null,
      }
      return { ...state, ...next, ...pushHistory(state, next, 'delete', cap) }
    }

    case 'deleteWordBackward': {
      const start = wordBoundaryBefore(state.value, state.caret)
      if (start === state.caret) return state
      const next = {
        value: state.value.slice(0, start) + state.value.slice(state.caret),
        caret: start,
        selection: null,
      }
      return { ...state, ...next, ...pushHistory(state, next, 'delete', cap) }
    }

    case 'deleteLineBackward': {
      // Ctrl+U: delete from caret back to start of current line.
      const { line } = lineColAt(state.value, state.caret)
      const lineStart = charIndexAtLineCol(state.value, line, 0)
      if (lineStart === state.caret) return state
      const next = {
        value: state.value.slice(0, lineStart) + state.value.slice(state.caret),
        caret: lineStart,
        selection: null,
      }
      return { ...state, ...next, ...pushHistory(state, next, 'delete', cap) }
    }

    case 'deleteLineForward': {
      // Ctrl+K: delete from caret to end of current line.
      const { line } = lineColAt(state.value, state.caret)
      const lines = splitLines(state.value)
      const lineEnd = charIndexAtLineCol(state.value, line, lines[line]?.length ?? 0)
      if (lineEnd === state.caret) return state
      const next = {
        value: state.value.slice(0, state.caret) + state.value.slice(lineEnd),
        caret: state.caret,
        selection: null,
      }
      return { ...state, ...next, ...pushHistory(state, next, 'delete', cap) }
    }

    case 'moveCaret': {
      const next = moveCaretIndex(state.value, state.caret, action.direction)
      const selection = action.extend
        ? { anchor: state.selection?.anchor ?? state.caret, focus: next }
        : null
      // Caret-only changes don't go to history (would crowd undo with
      // every arrow press).
      return { ...state, caret: next, selection }
    }

    case 'setCaret': {
      const target = Math.max(0, Math.min(action.charIdx, state.value.length))
      const selection = action.extend
        ? { anchor: state.selection?.anchor ?? state.caret, focus: target }
        : null
      return { ...state, caret: target, selection }
    }

    case 'selectAll': {
      return {
        ...state,
        selection: { anchor: 0, focus: state.value.length },
        caret: state.value.length,
      }
    }

    case 'undo': {
      if (state.historyIndex <= 0) return state
      const idx = state.historyIndex - 1
      const entry = state.history[idx]!
      return {
        ...state,
        value: entry.value,
        caret: entry.caret,
        selection: entry.selection,
        historyIndex: idx,
      }
    }

    case 'redo': {
      if (state.historyIndex >= state.history.length - 1) return state
      const idx = state.historyIndex + 1
      const entry = state.history[idx]!
      return {
        ...state,
        value: entry.value,
        caret: entry.caret,
        selection: entry.selection,
        historyIndex: idx,
      }
    }
  }
}

// ── Misc small utilities ─────────────────────────────────────────────

export function selectedText(state: TextInputState): string {
  if (!state.selection) return ''
  const [start, end] = selectionRange(state.selection)
  return state.value.slice(start, end)
}

export function selectionOrCaretRange(state: TextInputState): [number, number] {
  if (state.selection) return selectionRange(state.selection)
  return [state.caret, state.caret]
}
