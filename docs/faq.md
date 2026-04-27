# FAQ

Short answers to recurring questions. Each links to the canonical doc page when there's more depth.

## General

**What is yokai?**
A React reconciler for the terminal. Pure-TS Yoga flexbox, diff-based screen output, ScrollBox with viewport culling. Mount React components, get ANSI on stdout. See [README](./README.md).

**How is it different from Ink?**
Forked from Ink via claude-code-kit. Pure-TypeScript Yoga (no WASM), per-cell frame diffing with DECSTBM scroll hints, native ScrollBox with viewport culling, mouse events with gesture capture, drag/drop/resize primitives, focus groups with arrow navigation, alt-screen, z-index for absolutes. `flexShrink` defaults to `0` (matches Yoga, not CSS or Ink).

**When NOT to use yokai?**
For one-shot CLI output (a `--help` screen, a single status line) reach for plain `console.log` or `chalk`. yokai's payoff is interactive trees and sustained renders.

**Is it production-ready?**
Used by claude-corp in production. Stability is a hard requirement of the project. See [CONTRIBUTING.md](../CONTRIBUTING.md).

## Setup

**How do I install?**
`pnpm add @yokai/renderer @yokai/shared`. The renderer depends on the shared package; both must be installed.

**What Node and React versions?**
Node 20+. React 19 (the reconciler targets the React 19 host config).

**How do I consume from a non-monorepo project?**
Standard package install. The build artifacts are emitted by the workspace; no source-link required. If using TypeScript, ensure `moduleResolution` is `bundler` or `node16` so the `exports` map resolves.

## Layout

**Why is my Box empty?**
A Box with no `width`/`height` and no children collapses to zero. Add `flexGrow={1}` to take available space, or set explicit dimensions. See [styles reference](./reference/styles.md).

**Why does flexShrink behave differently from CSS?**
Yokai inherits Yoga's default of `flexShrink: 0`. CSS and Ink default to `1`. To allow a child to shrink past content size, set `flexShrink={1}` explicitly. See [styles reference](./reference/styles.md).

**Why is my absolute element not where I put it?**
`top`/`left`/`right`/`bottom` are relative to the nearest positioned ancestor (the parent Box, in yokai). Percent strings are percent of parent. `zIndex` is honored only on `position: 'absolute'` and only sorts among siblings of the same parent. See [styles reference](./reference/styles.md).

## Mouse and keyboard

**Why don't mouse events fire?**
Mouse tracking requires `<AlternateScreen mouseTracking>`. The alt-screen prop alone is not sufficient. See [troubleshooting](./troubleshooting.md).

**Why doesn't Tab work?**
`tabIndex` must be a non-negative number on a `<Box>`. `tabIndex="0"` (string) is ignored. `<Text>` does not accept `tabIndex`.

**Why don't arrow keys move focus?**
Tab cycling is global; arrow navigation is opt-in. Wrap the focusable region in `<FocusGroup direction="column" wrap>` (or `"row"`/`"both"`). `useFocusManager()` alone does not bind arrows. See [FocusGroup](./components/focus-group.md).

## Performance

**How big a tree is too big?**
Frame diffing is per-cell, not per-node, so paint cost is `O(changed cells)`. Tree size matters for layout (Yoga) and reconciliation (React). A few thousand nodes is fine; tens of thousands wants ScrollBox + viewport culling.

**When should I use ScrollBox?**
Whenever the rendered content can exceed its container. ScrollBox culls offscreen children before paint and emits hardware scroll hints (DECSTBM) on append. See [ScrollBox](./components/scrollbox.md).

**Does memoization help?**
Yes for expensive child trees. The reconciler is standard React 19 — `React.memo`, `useMemo`, and stable child `key`s all behave normally and prevent re-render of unchanged subtrees.

## Drag and drop

**Why does my Draggable's onClick not fire?**
A captured gesture suppresses the `onClick` for the release that ends it. If you `captureGesture` on every mousedown, you'll never see clicks. Capture conditionally — e.g. only after a motion threshold — or handle the click inside `onUp`. See [events reference](./reference/events.md).

**How do I cancel a drag?**
The capture cannot be released mid-flight (matches `setPointerCapture`). Track an `aborted` flag in your `onMove` and skip the work; the `onUp` will still fire and you can ignore it. The capture is also drained on `FOCUS_OUT` and lost-release recovery automatically.

## Resize

**Why does my content get clipped?**
`<Resizable>` clips overflow by default — content larger than the resized box is hidden. Set the inner content to `flexShrink={1}` or use a ScrollBox inside.

**Can I shrink past content size?**
Yes — pass `minSize={{ width: 1, height: 1 }}` or whatever floor you want. The default min is content size.

## Other

**How do I print debug output?**
Use `import { logForDebugging } from '@yokai/shared'`. Direct `console.log` is intercepted (when `patchConsole` is `true`) and routed to a buffer that prints above the rendered frame. See [debugging guide](./guides/debugging.md).

**How do I test components?**
Use `renderSync` with a fake `stdout`, then assert on the captured frame. See [testing guide](./guides/testing.md).

**How do I handle terminal resize?**
Read viewport reactively via `useTerminalViewport()`, or bind `onResize` on a Box. SIGWINCH can pulse rapidly during a window-drag-resize — debounce reactive reads. See [troubleshooting](./troubleshooting.md).
