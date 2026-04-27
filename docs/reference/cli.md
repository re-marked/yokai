# Render API reference

The three entry points for mounting a yokai tree, plus the shapes they return. Source: `packages/renderer/src/root.ts`.

## render

Default export. Async; mounts a node and returns an `Instance` once the first render boundary settles.

```ts
import render from '@yokai/renderer'
// or: import { render } from '@yokai/renderer'

const instance = await render(<App />, options?)
```

**Signature**

```ts
function render(
  node: ReactNode,
  options?: NodeJS.WriteStream | RenderOptions,
): Promise<Instance>
```

**Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `node` | `ReactNode` | Root element to mount. |
| `options` | `WriteStream \| RenderOptions` | If a `WriteStream` is passed, used as `stdout` with defaults for the rest. |

**Returns**: `Promise<Instance>`. The `await` boundary preserves a microtask tick before the first render so async startup work (e.g. notification state) settles before the first frame writes scrollback.

**When to use**: the common path. Standard apps, scripts, REPLs.

## renderSync

Synchronous variant. Mounts immediately and returns an `Instance` without awaiting a microtask.

**Signature**

```ts
function renderSync(
  node: ReactNode,
  options?: NodeJS.WriteStream | RenderOptions,
): Instance
```

**When to use**: tests, and callers that need the `Instance` reference before the first paint completes. Reuses an existing `Ink` instance for the same `stdout` if one is already registered (the `instances` registry maps `stdout` → `Ink`).

## createRoot

Async; constructs an `Ink` instance with no tree mounted. Call `root.render(node)` to mount.

**Signature**

```ts
function createRoot(options?: RenderOptions): Promise<Root>
```

**When to use**: pre-mount setup that needs to run after the renderer exists but before any React tree is committed — wiring listeners, registering external editor pause/resume, multi-screen apps that swap the root tree across phases.

The created instance is registered in the `instances` map so that lookups by `stdout` (e.g. external editor pause/resume) find it.

## RenderOptions

Accepted by all three entry points.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `stdout` | `NodeJS.WriteStream` | `process.stdout` | Where the app renders. |
| `stdin` | `NodeJS.ReadStream` | `process.stdin` | Where input is read from. |
| `stderr` | `NodeJS.WriteStream` | `process.stderr` | Error stream. |
| `exitOnCtrlC` | `boolean` | `true` | Listen for Ctrl+C and exit. Required when stdin is in raw mode (Ctrl+C is otherwise consumed by the app). |
| `patchConsole` | `boolean` | `true` | Patch `console.*` so direct console output doesn't tear the rendered frame. |
| `onFrame` | `(event: FrameEvent) => void` | `undefined` | Called after each composed frame with timing and flicker info. |

## Instance (from `render` / `renderSync`)

| Field | Type | Description |
|-------|------|-------------|
| `rerender` | `(node: ReactNode) => void` | Replace the root or update root props. Same as the `Ink#render` method. |
| `unmount` | `() => void` | Tear down the tree, restore the screen, exit alt-screen and mouse tracking, release Yoga nodes. |
| `waitUntilExit` | `() => Promise<void>` | Resolves when the app unmounts. Rejects if the app exits with an error via `useApp().exit(error)`. |
| `cleanup` | `() => void` | Remove this instance from the global `instances` registry. Call after `unmount` to free the `stdout` slot for a future `renderSync` to construct a new instance. |

## Root (from `createRoot`)

| Field | Type | Description |
|-------|------|-------------|
| `render` | `(node: ReactNode) => void` | Mount or replace the root tree. Call multiple times to swap trees. |
| `unmount` | `() => void` | Tear down. |
| `waitUntilExit` | `() => Promise<void>` | Resolves on unmount; rejects on `useApp().exit(error)`. |

## Lifecycle

`waitUntilExit` resolves when:

- `useApp().exit()` is called with no argument.
- `instance.unmount()` is called externally.
- Ctrl+C is received and `exitOnCtrlC` is `true`.
- A fatal signal (`SIGTERM`, `SIGHUP`) terminates the process.

It rejects when `useApp().exit(error)` is called with an `Error`.

Alt-screen and mouse-tracking cleanup runs unconditionally on signal-exit: `EXIT_ALT_SCREEN` and `DISABLE_MOUSE_TRACKING` are emitted every time because the `altScreenActive` flag can be stale. `?1049l` is a no-op when already on the main screen, so the unconditional path is safe.

## Examples

### Standard app

```tsx
import render, { Box, Text } from '@yokai/renderer'

const { waitUntilExit } = await render(
  <Box>
    <Text>hello</Text>
  </Box>,
)
await waitUntilExit()
```

### Test

```tsx
import { renderSync } from '@yokai/renderer'

const instance = renderSync(<MyComponent />, { stdout: fakeStdout })
// assertions on fakeStdout.lastFrame()
instance.unmount()
instance.cleanup()
```

### Pre-mount wiring

```tsx
import { createRoot } from '@yokai/renderer'

const root = await createRoot({ onFrame: recordFrameMetrics })
attachExternalEditorBridge(root)
root.render(<App />)
await root.waitUntilExit()
```

## Re-exports

`render`, `renderSync`, `createRoot`, and the types `RenderOptions`, `Instance`, `Root` are re-exported from the package root (`@yokai/renderer`).
