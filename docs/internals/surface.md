# Surface (internals)

How `<Surface>` is wired into the renderer, why each design decision went the way it did, and what to read before changing any of it. Consumer-facing reference lives in [components/surface.md](../components/surface.md).

## Architecture in one breath

`<Surface>` is mostly a React-side normalizer over `<ink-box>` (yokai's host node). Style / event props pass straight through; the only renderer additions are two new host attributes — `surfaceHitTestBoundary` and `surfaceElevation` — read by `hit-test.ts` and `render-node-to-output.ts` respectively. Layering is React-side (`resolveZIndex(layer, zIndex)` → numeric `zIndex` on the ink-box style). Backdrop is React-side (auto-rendered sibling Fragment).

```
packages/renderer/src/components/Surface/
├── types.ts        — SurfaceProps / SurfaceLayer / SurfaceElevation
├── layer.ts        — resolveZIndex(layer, explicit) — pure
├── shadow.ts       — shadowCells(rect, elevation) — pure
├── Surface.tsx     — React shell: layer/clip/hit-test/elevation/backdrop normalizers
└── index.ts        — public barrel
```

## Renderer touches

### `packages/renderer/src/types/jsx.d.ts`

Two attributes added to `InkBoxProps`:

```ts
surfaceHitTestBoundary?: boolean
surfaceElevation?: number
```

Same pattern as the existing `scrollBox` / `disableWheel` / `scrollWheelStep` attributes — declared on the host element type, set by the higher-level React shell, read by renderer subsystems via `node.attributes.X`.

### `packages/renderer/src/hit-test.ts`

The sibling-walk loop in `hitTestExcluding` honors the boundary attribute: when iterating an absolute Surface with `surfaceHitTestBoundary === true` whose rect contains the cursor, the surface is returned even if the normal recursion would have walked past it. In current code this is a no-op — reverse-z iteration already returns the topmost match first — but the explicit branch codifies the contract so a future hit-test refactor that changes the implicit "return self when in-bounds" semantics is forced to honor the flag.

See `hit-test.test.ts` for the pinned scenarios:
- click on boundary → boundary wins
- click off boundary → peer beneath wins
- boundary doesn't block siblings it doesn't cover
- nested descent inside a boundary works
- non-absolute boundary is silently ignored

### `packages/renderer/src/render-node-to-output.ts`

A single shadow paint pass at the top of the `ink-box` branch:

```ts
if (typeof elevation === 'number' && elevation > 0 && node.style.position === 'absolute') {
  paintShadowCells(shadowCells(rect, elevation), output)
}
```

Runs BEFORE the box's own paint (noSelect / overflow / fill / children / border) so the shadow cells — which sit OUTSIDE the box's rect — overlay any lower-z sibling cells already painted into the shadow band. Each shadow cell is written as a background-filled space using the reserved `SHADOW_COLOR` (`'#1a1a1a'`).

Per-cell `dim` levels from `shadowCells` are not currently used — v1 paints all shadow cells with the single reserved color. The level field remains in the cell record for future multi-tone shading without an API change.

#### Known limitation: stale shadow under clean-blit

If a lower-z sibling is dirty AND this Surface is NOT dirty (so it takes the blit fast path), the sibling's repaint overwrites the shadow cells while this Surface re-blits its own rect without re-painting the shadow. The shadow returns on the next frame this Surface itself dirties. Acceptable for v1; a follow-up could register shadow cells in `pendingClears` or as parent-tracked dirty regions if real consumers hit this.

## Design questions — committed answers

The five questions raised in the spec, with the chosen defaults and reasoning.

### 1. Thin wrapper or new host-level semantic marker?

**Hybrid.** Mostly a React-side normalizer over `<ink-box>` (the cheapest, least-invasive choice for layout / style / event passthrough), with the minimum-viable host additions for the truly host-level concerns: `surfaceHitTestBoundary` for the hit-test path, `surfaceElevation` for the paint pass. No new host node types — both attributes ride on existing `ink-box`.

### 2. `hitTestBoundary` default?

**`false`.** Modals / popovers / menus opt in via `hitTestBoundary`; drag ghosts and tooltips don't need it. Auto-defaulting based on `layer` (e.g. modal=true, tooltip=false) would couple two orthogonal concerns and create surprise — explicit opt-in is the predictable default.

### 3. `layer` abstraction beyond numeric `zIndex`?

**Yes — named enum + numeric escape hatch.** The whole point of Surface is preventing every primitive from rediscovering "what z is a modal" — name it. The numeric `zIndex` prop wins when both are supplied (documented precedence) so consumers can nudge within a band (`<Surface layer="modal" zIndex={3001}>` is a peer modal painting just above).

### 4. `clip` default?

**Preserve Box's default (`overflow: 'visible'`).** Surprise is the bigger cost — `<Box>` → `<Surface>` should be a safe swap. Opt in via `clip="hidden"`. Resizable's migration explicitly sets `clip="hidden"` to preserve its prior `overflow="hidden"` default.

### 5. Shadow / backdrop in v1?

**Yes — ship all of it.** Per the user's brief. Shadow is one cell loop in `render-node-to-output.ts` gated by an attribute; backdrop is one auto-rendered sibling Box. Both are bounded, isolated, fully tested at the cell level.

## Migrations

`<Draggable>` and `<Resizable>` paint through Surface. No public API change to either component; the swap preserves all behavior:

- **Draggable**: outer `<Box>` → `<Surface>`. The raise-on-press z math (`persistedZ + DRAG_Z_BOOST`) flows through Surface's explicit `zIndex` prop. `layer` is not set — the explicit `zIndex` is the sole z source, matching pre-migration semantics.
- **Resizable**: outer `<Box overflow="hidden">` → `<Surface clip="hidden">`. Same effect, named through the Surface vocabulary. Handle subcomponents stay plain absolute `<Box>` elements — Resizable's handle math is unchanged.

Both component test files (`Draggable.test.tsx`, `Resizable.test.tsx`) stay green without modification.

## Future composition

When `<Window>` lands (A4), it composes `<Surface layer="overlay" elevation={2}>` + `<Draggable>` + `<Resizable>` + title chrome. Because all three primitives speak Surface's z-band vocabulary, the layering math Just Works.

Phase 2 portals / Modal / Popover / Tooltip / Menu / DragGhost components are each a thin wrapper around `<Surface>` with a layer preset and a couple of props baked in. Separate plans land them.

## See also
- [Render pipeline](./render-pipeline.md)
- [Yoga port](./yoga-port.md)
- [Drag registry](./drag-registry.md)
