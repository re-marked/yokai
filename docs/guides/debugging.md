# Debugging

How to inspect a running yokai app.

## Logging

The renderer owns stdout in alt-screen mode — anything you `console.log` is overwritten or eaten. Write to stderr instead.

```ts
process.stderr.write(`[debug] selected=${selected}\n`)
```

In a separate shell, redirect stderr to a file or another terminal:

```bash
node app.js 2> /tmp/yokai.log
tail -f /tmp/yokai.log
```

## DEBUG flag

`@yokai/shared` exposes `logForDebugging(message, { level })` which is gated on:

- `DEBUG=1` or `DEBUG=true` in the environment
- `--debug` in `process.argv`

Source: `packages/shared/src/debug.ts`.

```bash
DEBUG=1 node app.js 2> /tmp/yokai.log
```

Output format: `2026-04-26T12:34:56.789Z [DEBUG] message`. Levels: `verbose`, `debug`, `info`, `warn`, `error`. `enableDebugLogging()` flips the flag at runtime.

## Frame capture

`createRoot` and `render` accept an `onFrame` callback fired after every committed frame.

```ts
import { createRoot } from '@yokai/renderer'

const root = await createRoot({
  onFrame: (event) => {
    process.stderr.write(`frame: ${event.durationMs.toFixed(1)}ms patches=${event.phases?.patches}\n`)
    for (const f of event.flickers) {
      process.stderr.write(`  flicker: ${f.reason} (${f.desiredHeight}/${f.availableHeight})\n`)
    }
  },
})
root.render(<App />)
```

`FrameEvent` carries phase timings (renderer, diff, optimize, write, yoga), patch counts, live Yoga node count, and any flickers (`resize` / `offscreen` / `clear`). See `packages/renderer/src/frame.ts`.

## Capturing raw stdout

Pipe stdout through a tee to inspect the ANSI byte stream alongside a live render:

```bash
node app.js | tee /tmp/yokai.ansi
```

Replay with `cat /tmp/yokai.ansi` in a terminal of the same dimensions.

## Stack traces

Yokai source is TypeScript. Run with [`tsx`](https://github.com/privatenumber/tsx) or with `--enable-source-maps` to get readable traces.

```bash
node --enable-source-maps app.js
# or
tsx app.tsx
```

## Common failures

See [troubleshooting.md](./troubleshooting.md). The frequent ones:

- Output mixes with `console.log` → set `patchConsole: true` (default) or write to stderr
- Mouse events do nothing → wrap the tree in `<AlternateScreen>`
- `useFocus` reports never-focused → attach `ref` AND pass `tabIndex={0}` on the Box
- Layout collapses unexpectedly → set `flexShrink={1}` (yokai's default is 0, not 1)
- Ctrl+C does not exit → check `exitOnCtrlC: true` on render options, or that no `useInput` handler is swallowing the event
