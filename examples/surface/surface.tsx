/**
 * yokai · surface
 *
 *   pnpm demo:surface
 *
 * Compact tour of every `<Surface>` aspect on a single screen, with
 * interactive controls that exercise the edge cases and known
 * limitations:
 *
 *   • LAYERS  — 8 named bands paint in the documented order
 *   • ELEVATION — shadows at 0..5 with side-by-side comparison
 *   • BOUNDARY — clickable boundary occludes a clickable sibling at
 *     the cells it covers, click-through everywhere else
 *   • MODAL+BACKDROP — auto-scrim layered just below the modal,
 *     stacking correctly when nested
 *   • COMPOSITION — Draggable inside an elevated Surface; drag-time
 *     z boost still wins paint over the parent Surface chrome
 *   • STRESS — movable / resizable elevated Surface that exercises
 *     the shadow-clear-on-move/shrink path (codex P2 fix on #90)
 *   • BOX PARITY — bare <Surface> next to a bare <Box> with the same
 *     props; you should not be able to tell them apart
 *
 * Keys
 *   q · Esc · Ctrl+C   quit
 *   m                  toggle modal (with backdrop)
 *   n                  toggle a nested modal (peer above the first)
 *   ←→↑↓               move the stress-test surface (cells)
 *   - / =              shrink / grow the stress-test surface
 *   [ / ]              decrease / increase its elevation
 */

import {
  AlternateScreen,
  Box,
  Draggable,
  Surface,
  Text,
  render,
  useApp,
  useInput,
} from '@yokai-tui/renderer'
import type React from 'react'
import { useState } from 'react'

const C = {
  bg: '#0a0e14',
  panel: '#0f172a',
  border: '#334155',
  accent: '#7dd3fc',
  warn: '#fbbf24',
  ok: '#86efac',
  text: '#cbd5e1',
  dim: '#64748b',
  modal: '#0c4a6e',
  modalBorder: '#7dd3fc',
} as const

const LAYERS = [
  { layer: 'base' as const, z: 0, color: '#1e293b' },
  { layer: 'docked' as const, z: 100, color: '#334155' },
  { layer: 'overlay' as const, z: 1000, color: '#475569' },
  { layer: 'dropdown' as const, z: 2000, color: '#0f766e' },
  { layer: 'modal' as const, z: 3000, color: '#0e7490' },
  { layer: 'popover' as const, z: 4000, color: '#0369a1' },
  { layer: 'tooltip' as const, z: 5000, color: '#1d4ed8' },
  { layer: 'drag-ghost' as const, z: 6000, color: '#4f46e5' },
]

// ── section helpers ──────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <Box marginBottom={0}>
      <Text bold color={C.accent}>
        {children}
      </Text>
    </Box>
  )
}

// ── individual sections ──────────────────────────────────────────────

/** All 8 layers, stacked from top-left with horizontal overlap so the
 *  highest band ends up visibly on top — proves the paint-order
 *  contract in one glance. Each surface fits a 4-char label in its
 *  visible portion (the rest is occluded by the next layer's left
 *  edge); the section title carries the layer→z mapping reference. */
function LayersDemo(): React.ReactNode {
  // 4-char abbreviations sized to fit the visible portion of each
  // surface (each spans 14 cells but only the first 6 are visible
  // before the next-higher-z layer's left edge covers it; after
  // border (1) + padding (0) → 5 visible content cells, comfortable
  // for 4-char labels with one cell breathing room).
  const ABBR: Record<(typeof LAYERS)[number]['layer'], string> = {
    base: 'base',
    docked: 'dock',
    overlay: 'over',
    dropdown: 'drop',
    modal: 'modl',
    popover: 'popo',
    tooltip: 'tool',
    'drag-ghost': 'ghst',
  }
  return (
    <Box position="relative" width={56} height={3}>
      {LAYERS.map((l, i) => (
        <Surface
          key={l.layer}
          position="absolute"
          top={0}
          left={i * 6}
          width={14}
          height={3}
          layer={l.layer}
          backgroundColor={l.color}
          borderStyle="single"
          borderColor={C.border}
        >
          <Text color={C.text}>{ABBR[l.layer]}</Text>
        </Surface>
      ))}
    </Box>
  )
}

/** Six surfaces at elev 0..5, side-by-side. Visually shows the shadow
 *  band growing thicker as elevation rises. `shadowColor` is brightened
 *  from the default near-black so the band is visible against the
 *  demo's dark background. */
function ElevationRow(): React.ReactNode {
  return (
    <Box position="relative" width={56} height={5}>
      {([0, 1, 2, 3, 4, 5] as const).map((e) => (
        <Surface
          key={e}
          position="absolute"
          top={0}
          left={e * 9}
          width={6}
          height={3}
          backgroundColor={C.panel}
          borderStyle="round"
          borderColor={C.border}
          elevation={e}
          shadowColor="#475569"
          alignItems="center"
          justifyContent="center"
        >
          <Text color={C.text}>e={e}</Text>
        </Surface>
      ))}
    </Box>
  )
}

/** Two overlapping clickable Surfaces. The boundary (top, layer='modal')
 *  occludes the sibling everywhere it covers, but the sibling sticks
 *  out on the left and right — clicks there reach the sibling. */
function BoundaryDemo({
  boundaryClicks,
  siblingClicks,
  bumpBoundary,
  bumpSibling,
}: {
  boundaryClicks: number
  siblingClicks: number
  bumpBoundary: () => void
  bumpSibling: () => void
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Box>
        <Text dim>boundary: </Text>
        <Text color={C.ok}>{boundaryClicks}</Text>
        <Text dim>   sibling: </Text>
        <Text color={C.warn}>{siblingClicks}</Text>
      </Box>
      <Box position="relative" width={32} height={4}>
        {/* Sibling spans wider than the boundary so its left + right
            edges remain hittable while the boundary covers its middle. */}
        <Surface
          position="absolute"
          top={0}
          left={0}
          width={32}
          height={4}
          backgroundColor="#7f1d1d"
          borderStyle="single"
          borderColor="#fca5a5"
          alignItems="center"
          justifyContent="center"
          zIndex={5}
          onClick={bumpSibling}
        >
          <Text color="white">click anywhere · sibling</Text>
        </Surface>
        {/* Boundary on top covers the middle 16 cells. Height=3 so the
            border (1 row top + 1 row bottom) still leaves 1 row for the
            label; with height=2 the label would have no inner space. */}
        <Surface
          position="absolute"
          top={0}
          left={8}
          width={16}
          height={3}
          layer="modal"
          backgroundColor={C.modal}
          borderStyle="round"
          borderColor={C.modalBorder}
          hitTestBoundary
          alignItems="center"
          justifyContent="center"
          onClick={bumpBoundary}
        >
          <Text color="white">boundary</Text>
        </Surface>
      </Box>
    </Box>
  )
}

/** Draggable inside an elevated Surface. Drag the inner box around —
 *  drag-time z boost lifts it above the parent's chrome.
 *
 *  Draggable's `initialPos` resolves against the parent's padding-box
 *  per CSS §10.1, not the content box. With this Surface's padding=1,
 *  initialPos={top:1, left:1} would land on the SAME row as the
 *  in-flow text (text starts at content origin = padding+border). We
 *  intentionally push Draggable down to top=2 so it sits BELOW the
 *  label row inside the content area. */
function CompositionDemo(): React.ReactNode {
  return (
    <Surface
      position="absolute"
      top={0}
      left={0}
      width={32}
      height={6}
      layer="overlay"
      backgroundColor={C.panel}
      borderStyle="single"
      borderColor={C.border}
      elevation={2}
      shadowColor="#475569"
      padding={1}
    >
      <Text dim>elevated overlay · drag me ↓</Text>
      <Draggable
        initialPos={{ top: 2, left: 1 }}
        width={10}
        height={2}
        backgroundColor="#06b6d4"
        borderStyle="round"
        borderColor="#a5f3fc"
      />
    </Surface>
  )
}

/** Side-by-side Box / Surface with identical props — should be
 *  visually indistinguishable. Pinned by Surface.test.tsx but worth
 *  showing live so the parity isn't quietly lost. */
function ParityDemo(): React.ReactNode {
  return (
    <Box flexDirection="row" gap={2}>
      <Box flexDirection="column">
        <Text dim>Box</Text>
        <Box
          width={12}
          height={3}
          backgroundColor={C.panel}
          borderStyle="single"
          borderColor={C.border}
          alignItems="center"
          justifyContent="center"
        >
          <Text color={C.text}>identical</Text>
        </Box>
      </Box>
      <Box flexDirection="column">
        <Text dim>Surface</Text>
        <Surface
          width={12}
          height={3}
          backgroundColor={C.panel}
          borderStyle="single"
          borderColor={C.border}
          alignItems="center"
          justifyContent="center"
        >
          <Text color={C.text}>identical</Text>
        </Surface>
      </Box>
    </Box>
  )
}

/** Movable + resizable + elevation-adjustable Surface. Exercises the
 *  shadow-clear-on-move/shrink path (codex P2 fix on #90) — drag with
 *  arrow keys, watch the shadow band reposition without leaving
 *  stale cells from the previous frame. */
function StressDemo({
  pos,
  size,
  elev,
}: {
  pos: { top: number; left: number }
  size: { w: number; h: number }
  elev: 0 | 1 | 2 | 3 | 4 | 5
}): React.ReactNode {
  return (
    <Box position="relative" width={36} height={9}>
      <Surface
        position="absolute"
        top={pos.top}
        left={pos.left}
        width={size.w}
        height={size.h}
        backgroundColor={C.modal}
        borderStyle="round"
        borderColor={C.modalBorder}
        elevation={elev}
        shadowColor="#475569"
        alignItems="center"
        justifyContent="center"
      >
        <Text color="white">
          e={elev}{' '}
          <Text dim>
            {size.w}x{size.h}
          </Text>
        </Text>
      </Surface>
    </Box>
  )
}

/** Modal at layer='modal' with auto-rendered backdrop. Clicking the
 *  modal closes it. */
function Modal({
  title,
  z,
  onClose,
}: {
  title: string
  z?: number
  onClose: () => void
}): React.ReactNode {
  return (
    <Surface
      position="absolute"
      top={5}
      left={20}
      width={40}
      height={6}
      layer="modal"
      zIndex={z}
      backgroundColor={C.modal}
      borderStyle="round"
      borderColor={C.modalBorder}
      padding={1}
      backdrop
      backdropColor={C.bg}
      alignItems="center"
      justifyContent="center"
      hitTestBoundary
      onClick={onClose}
    >
      <Text bold color="white">
        {title}
      </Text>
      <Text color={C.modalBorder}>
        layer='modal' · z={z ?? 3000}
      </Text>
      <Text dim>click to close</Text>
    </Surface>
  )
}

// ── app shell ────────────────────────────────────────────────────────

function App(): React.ReactNode {
  const { exit } = useApp()
  const [modalOpen, setModalOpen] = useState(false)
  const [nestedOpen, setNestedOpen] = useState(false)
  const [boundaryClicks, setBoundaryClicks] = useState(0)
  const [siblingClicks, setSiblingClicks] = useState(0)
  const [pos, setPos] = useState({ top: 2, left: 6 })
  const [size, setSize] = useState({ w: 14, h: 4 })
  const [elev, setElev] = useState<0 | 1 | 2 | 3 | 4 | 5>(2)

  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) return exit()
    if (input === 'm') setModalOpen((o) => !o)
    if (input === 'n') setNestedOpen((o) => !o)
    if (key.upArrow) setPos((p) => ({ ...p, top: Math.max(0, p.top - 1) }))
    if (key.downArrow) setPos((p) => ({ ...p, top: Math.min(4, p.top + 1) }))
    if (key.leftArrow) setPos((p) => ({ ...p, left: Math.max(0, p.left - 1) }))
    if (key.rightArrow) setPos((p) => ({ ...p, left: Math.min(20, p.left + 1) }))
    if (input === '-') setSize((s) => ({ w: Math.max(4, s.w - 1), h: s.h }))
    if (input === '=') setSize((s) => ({ w: Math.min(20, s.w + 1), h: s.h }))
    if (input === '[') setElev((e) => Math.max(0, e - 1) as typeof elev)
    if (input === ']') setElev((e) => Math.min(5, e + 1) as typeof elev)
  })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" width="100%" height="100%" padding={1} backgroundColor={C.bg}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color={C.accent}>
            yokai · Surface demo
          </Text>
          <Text dim>
            q quit · m modal · n nested modal · arrows/⁠-/=/[/] stress
          </Text>
        </Box>

        <Box marginTop={1}>
          <SectionTitle>1 · LAYERS</SectionTitle>
        </Box>
        <LayersDemo />

        <Box marginTop={1}>
          <SectionTitle>2 · ELEVATION (0…5)</SectionTitle>
        </Box>
        <ElevationRow />

        <Box marginTop={1} flexDirection="row" gap={2}>
          <Box flexDirection="column">
            <SectionTitle>3 · BOUNDARY</SectionTitle>
            <BoundaryDemo
              boundaryClicks={boundaryClicks}
              siblingClicks={siblingClicks}
              bumpBoundary={() => setBoundaryClicks((n) => n + 1)}
              bumpSibling={() => setSiblingClicks((n) => n + 1)}
            />
          </Box>
          <Box flexDirection="column" position="relative">
            <SectionTitle>4 · COMPOSITION</SectionTitle>
            <Box position="relative" width={32} height={6}>
              <CompositionDemo />
            </Box>
          </Box>
        </Box>

        <Box marginTop={1} flexDirection="row" gap={2}>
          <Box flexDirection="column">
            <SectionTitle>5 · BOX/SURFACE PARITY</SectionTitle>
            <ParityDemo />
          </Box>
          <Box flexDirection="column">
            <SectionTitle>6 · STRESS (shadow clear-on-move/shrink)</SectionTitle>
            <StressDemo pos={pos} size={size} elev={elev} />
          </Box>
        </Box>

        {modalOpen && <Modal title="MODAL · m to close" onClose={() => setModalOpen(false)} />}
        {nestedOpen && (
          <Modal
            title="NESTED MODAL · n to close"
            z={3010}
            onClose={() => setNestedOpen(false)}
          />
        )}
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
