/**
 * yokai · TUI Desktop demo.
 *
 *   pnpm demo:tui-desktop
 *
 * A miniature desktop OS in your terminal. Multiple draggable windows,
 * each running a different "app", all driven by mouse + keyboard.
 *
 *   - Drag any window's title bar to move it
 *   - Click anywhere on a window to bring it to the front
 *   - Click the [×] in any title bar to close that window
 *   - Click "[+ Note]" in the taskbar to spawn a new sticky note
 *   - Click any taskbar entry to focus that window
 *   - Type into the Notes window — full multiline soft-wrap editing
 *   - Click a color swatch in the Palette to pick it
 *   - Watch the Clock tick in real time
 *
 * Press `q` or Ctrl+C to quit.
 *
 * Built on yokai's primitives:
 *
 *   <Draggable>  — gesture capture, raise-on-press z-order, drag-time z boost
 *   <TextInput>  — multiline soft-wrap with hanging indent, identifier-aware
 *                  word boundaries, multi-row selection stripe, undo/redo
 *   <Box>        — Yoga flexbox with absolute positioning + z-index stacking
 *   <Text>       — colored, bold, dim, with backgrounds
 *   useInput     — keyboard shortcuts
 *   captureGesture — title-bar / close-button hit isolation
 */

import {
  AlternateScreen,
  Box,
  type Color,
  Draggable,
  type MouseDownEvent,
  TerminalSizeContext,
  Text,
  TextInput,
  render,
  useApp,
  useInput,
} from '@yokai/renderer'
import type React from 'react'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'

// ── App types ──────────────────────────────────────────────────────────

type AppKind = 'notes' | 'clock' | 'palette' | 'about'

type Win = {
  id: string
  kind: AppKind
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  /** Per-app state. Notes carry their text here. Palette carries the
   *  picked color. Clock + About are stateless. */
  state: { text?: string; pickedColor?: Color }
}

const WINDOW_TITLES: Record<AppKind, string> = {
  notes: '✎  Notes',
  clock: '⏱  Clock',
  palette: '◉  Palette',
  about: 'ⓘ  About',
}

const WINDOW_ACCENTS: Record<AppKind, Color> = {
  notes: 'yellow',
  clock: 'cyan',
  palette: 'magenta',
  about: 'green',
}

// ── Window chrome ──────────────────────────────────────────────────────

/**
 * The window frame. Wraps a `<Draggable>` with a title bar (the drag
 * handle) and a close button. Children render inside the content area.
 *
 * Click semantics:
 *   - Drag on the title bar moves the window. The Draggable underneath
 *     handles the gesture; bumping z is automatic.
 *   - Click on the close button (×) closes the window. The button's own
 *     onMouseDown captures the gesture and stops propagation, so the
 *     enclosing Draggable doesn't try to also drag.
 *   - Click anywhere else on the window first calls `onFocus` — brings
 *     this window to the top of the z-stack regardless of where in
 *     the tree it is.
 */
function Window({
  win,
  isFocused,
  onMove,
  onClose,
  onFocus,
  bounds,
  children,
}: {
  win: Win
  isFocused: boolean
  onMove: (id: string, pos: { left: number; top: number }) => void
  onClose: (id: string) => void
  onFocus: (id: string) => void
  bounds: { width: number; height: number }
  children: React.ReactNode
}): React.ReactNode {
  const accent = WINDOW_ACCENTS[win.kind]
  const handleClose = useCallback(
    (e: MouseDownEvent) => {
      // Stop the press from bubbling to the Draggable underneath.
      // Without this, the close click would also trigger Draggable's
      // mouseDown (and its raise-on-press z bump), and the close action
      // would race with a phantom drag-start.
      e.stopImmediatePropagation()
      e.captureGesture({ onUp: () => onClose(win.id) })
    },
    [onClose, win.id],
  )
  return (
    <Draggable
      key={win.id}
      initialPos={{ left: win.x, top: win.y }}
      width={win.width}
      height={win.height}
      bounds={bounds}
      borderStyle="round"
      borderColor={isFocused ? accent : 'gray'}
      backgroundColor="black"
      flexDirection="column"
      onDrag={({ pos }) => onMove(win.id, pos)}
      onDragEnd={({ pos }) => onMove(win.id, pos)}
      onClick={() => onFocus(win.id)}
    >
      {/* Title bar — drag handle + close button. Background uses the
          window's accent so each app reads at a glance. */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        backgroundColor={isFocused ? accent : 'gray'}
        paddingX={1}
      >
        <Text bold color="black">
          {WINDOW_TITLES[win.kind]}
        </Text>
        <Box paddingX={1} onMouseDown={handleClose}>
          <Text bold color="black">
            ×
          </Text>
        </Box>
      </Box>
      {/* Content area. Padding keeps content off the rounded border. */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {children}
      </Box>
    </Draggable>
  )
}

// ── Apps ───────────────────────────────────────────────────────────────

/** Notes app — multiline soft-wrap text editor inside a window.
 *  Showcases the TextInput primitive (PR #38, #39, #40 work):
 *  hanging indent, identifier word-boundaries, multi-row selection
 *  stripe, undo/redo, click + Tab focus, etc. */
function NotesApp({
  win,
  onChange,
}: {
  win: Win
  onChange: (id: string, text: string) => void
}): React.ReactNode {
  return (
    <TextInput
      value={win.state.text ?? ''}
      onChange={(t) => onChange(win.id, t)}
      multiline
      placeholder="Type a note…"
      width={win.width - 2}
      height={win.height - 4}
    />
  )
}

/** Clock app — live time + date. The `tick` interval drives a re-render
 *  every second, which would normally hammer the renderer; yokai's
 *  cell-diff output sends only the changing seconds digit per tick. */
function ClockApp(): React.ReactNode {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const time = now.toLocaleTimeString('en-US', { hour12: false })
  const date = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <Text bold color="cyan">
        {time}
      </Text>
      <Text dim>{date}</Text>
    </Box>
  )
}

/** Color palette — clickable swatches. Click one to "pick" it; the
 *  picked color shows in the bottom bar. Demonstrates per-cell click
 *  handlers in a grid. */
const PALETTE_COLORS: ReadonlyArray<Color> = [
  'red',
  'yellow',
  'green',
  'cyan',
  'blue',
  'magenta',
  'white',
  'gray',
]

function PaletteApp({
  win,
  onPick,
}: {
  win: Win
  onPick: (id: string, color: Color) => void
}): React.ReactNode {
  const picked = win.state.pickedColor ?? 'red'
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {PALETTE_COLORS.map((color) => (
          <Box
            key={color}
            width={4}
            height={2}
            backgroundColor={color}
            borderStyle={color === picked ? 'round' : undefined}
            borderColor="white"
            onMouseDown={(e) => {
              e.stopImmediatePropagation()
              e.captureGesture({ onUp: () => onPick(win.id, color) })
            }}
          />
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dim>picked: </Text>
        <Text bold color={picked}>
          ●
        </Text>
        <Text> {picked}</Text>
      </Box>
    </Box>
  )
}

/** About app — static info + interaction hints. */
function AboutApp(): React.ReactNode {
  return (
    <Box flexDirection="column" gap={0}>
      <Text bold color="green">
        yokai
      </Text>
      <Text dim>terminal renderer · React · Yoga flexbox</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>drag title bars · click to focus · [×] close</Text>
        <Text>[+ Note] adds a sticky note · q to quit</Text>
      </Box>
    </Box>
  )
}

// ── Taskbar ────────────────────────────────────────────────────────────

/** Bottom bar — list of open windows + spawn button. Click an entry to
 *  focus that window. Click [+ Note] to spawn a fresh sticky note. */
function Taskbar({
  windows,
  focusedId,
  onFocus,
  onSpawnNote,
}: {
  windows: ReadonlyArray<Win>
  focusedId: string | null
  onFocus: (id: string) => void
  onSpawnNote: () => void
}): React.ReactNode {
  return (
    <Box
      flexDirection="row"
      backgroundColor="black"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      gap={1}
    >
      <Box
        paddingX={1}
        backgroundColor="green"
        onMouseDown={(e) => {
          e.stopImmediatePropagation()
          e.captureGesture({ onUp: () => onSpawnNote() })
        }}
      >
        <Text bold color="black">
          + Note
        </Text>
      </Box>
      <Text dim>│</Text>
      {windows.map((win) => {
        const accent = WINDOW_ACCENTS[win.kind]
        const focused = win.id === focusedId
        return (
          <Box
            key={win.id}
            paddingX={1}
            backgroundColor={focused ? accent : undefined}
            borderStyle={focused ? 'single' : undefined}
            borderColor="gray"
            onMouseDown={(e) => {
              e.stopImmediatePropagation()
              e.captureGesture({ onUp: () => onFocus(win.id) })
            }}
          >
            <Text bold color={focused ? 'black' : accent}>
              {WINDOW_TITLES[win.kind]}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

// ── Main app ───────────────────────────────────────────────────────────

// Initial layout sized for an 80x24 terminal with the taskbar's 4-row
// footprint reserved at the bottom. All four windows fit without
// initial overlap; user can drag them around once the demo starts.
const INITIAL_WINDOWS: ReadonlyArray<Win> = [
  {
    id: 'notes-1',
    kind: 'notes',
    x: 2,
    y: 1,
    width: 42,
    height: 10,
    zIndex: 1,
    state: {
      text: 'Welcome to yokai!\n\nDrag this window by its title bar.\nType in here — full multiline soft-wrap.\nShift+arrow extends the selection across rows.',
    },
  },
  {
    id: 'clock-1',
    kind: 'clock',
    x: 48,
    y: 1,
    width: 28,
    height: 6,
    zIndex: 2,
    state: {},
  },
  {
    id: 'palette-1',
    kind: 'palette',
    x: 48,
    y: 8,
    width: 28,
    height: 11,
    zIndex: 3,
    state: { pickedColor: 'cyan' },
  },
  {
    id: 'about-1',
    kind: 'about',
    x: 2,
    y: 12,
    width: 42,
    height: 7,
    zIndex: 4,
    state: {},
  },
]

function App(): React.ReactNode {
  const { exit } = useApp()
  const size = useContext(TerminalSizeContext)
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit()
  })

  const [windows, setWindows] = useState<ReadonlyArray<Win>>(INITIAL_WINDOWS)
  const [focusedId, setFocusedId] = useState<string | null>(INITIAL_WINDOWS.at(-1)?.id ?? null)

  // Bounds for window dragging — leave room for the taskbar at the
  // bottom (3 rows: border + content + border). Falls back to a
  // sensible default before first measurement.
  const bounds = useMemo(
    () => ({
      width: size?.columns ?? 100,
      height: Math.max(1, (size?.rows ?? 24) - 4),
    }),
    [size?.columns, size?.rows],
  )

  const handleFocus = useCallback((id: string) => {
    setWindows((prev) => {
      const w = prev.find((x) => x.id === id)
      if (!w) return prev
      // Math.max(0, ...) so an empty windows array still gives a sane
      // base. Bare Math.max(...[]) returns -Infinity (and `|| 0` won't
      // catch it since -Infinity is truthy).
      const newZ = Math.max(0, ...prev.map((x) => x.zIndex)) + 1
      return prev.map((x) => (x.id === id ? { ...x, zIndex: newZ } : x))
    })
    setFocusedId(id)
  }, [])

  const handleMove = useCallback((id: string, pos: { left: number; top: number }) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, x: pos.left, y: pos.top } : w)))
  }, [])

  const handleClose = useCallback(
    (id: string) => {
      setWindows((prev) => prev.filter((w) => w.id !== id))
      if (focusedId === id) setFocusedId(null)
    },
    [focusedId],
  )

  const handleNoteText = useCallback((id: string, text: string) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, state: { ...w.state, text } } : w)))
  }, [])

  const handlePick = useCallback((id: string, color: Color) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, state: { ...w.state, pickedColor: color } } : w)),
    )
  }, [])

  const handleSpawnNote = useCallback(() => {
    const id = `notes-${Date.now()}`
    setWindows((prev) => {
      const newZ = Math.max(0, ...prev.map((x) => x.zIndex)) + 1
      return [
        ...prev,
        {
          id,
          kind: 'notes',
          // Cascade new notes a little down-and-right of the previous one
          // so multiple spawns don't perfectly overlap.
          x: 6 + ((prev.length * 3) % 20),
          y: 4 + ((prev.length * 2) % 12),
          width: 36,
          height: 10,
          zIndex: newZ,
          state: { text: '' },
        },
      ]
    })
    setFocusedId(id)
  }, [])

  return (
    <AlternateScreen mouseTracking pasteThreshold={32}>
      <Box flexDirection="column" width="100%" height="100%" backgroundColor="blackBright">
        {/* Desktop area — windows live here, sorted by z-index so the
            React DOM order matches paint order (yokai's painter respects
            zIndex on absolute children, but matching tree order makes
            hit-test predictable too). */}
        <Box flexDirection="column" flexGrow={1} backgroundColor="blackBright">
          {[...windows]
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((win) => (
              <Window
                key={win.id}
                win={win}
                isFocused={win.id === focusedId}
                onMove={handleMove}
                onClose={handleClose}
                onFocus={handleFocus}
                bounds={bounds}
              >
                {win.kind === 'notes' && <NotesApp win={win} onChange={handleNoteText} />}
                {win.kind === 'clock' && <ClockApp />}
                {win.kind === 'palette' && <PaletteApp win={win} onPick={handlePick} />}
                {win.kind === 'about' && <AboutApp />}
              </Window>
            ))}
        </Box>
        {/* Taskbar — bottom bar with spawn button + open windows. */}
        <Taskbar
          windows={windows}
          focusedId={focusedId}
          onFocus={handleFocus}
          onSpawnNote={handleSpawnNote}
        />
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
