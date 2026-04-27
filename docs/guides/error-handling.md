# Error handling

How yokai surfaces runtime failures, where the boundaries are, and what the consumer is responsible for.

Yokai uses standard React error boundaries plus a few terminal-specific concerns: stdout is owned by the renderer, the alt-screen and mouse-tracking modes need to be torn down even on crash, and exit codes matter because yokai apps are usually CLIs.

## Built-in error boundary

The top-level `<App>` wraps its children in `<ErrorOverview>`. When a descendant throws during render, `<ErrorOverview>` catches it and renders the stack and component tree in place of the crashed subtree. The renderer keeps running.

See [`<ErrorOverview>`](../components/error-overview.md).

This is the default — you get it for free from `render()` and `createRoot()`.

## Custom error boundaries

For finer-grained recovery, write a React class component with `getDerivedStateFromError` and `componentDidCatch`. The same React API works inside yokai.

```tsx
import { Component, type ReactNode } from 'react'
import { Box, Text } from '@yokai/renderer'

class Boundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    process.stderr.write(`[boundary] ${error.message}\n${info.componentStack}\n`)
  }

  override render() {
    if (this.state.error) return this.props.fallback
    return this.props.children
  }
}

// Usage
<Boundary fallback={<Text color="red">Sidebar unavailable</Text>}>
  <Sidebar />
</Boundary>
```

Place boundaries at the granularity where partial failure is acceptable: a sidebar, a modal, a single panel. Wrapping every leaf is overkill; wrapping only the root throws away the recovery story.

## Async errors are not caught

Error boundaries catch errors thrown during render, in lifecycle methods, and in constructors. They do not catch:

- Errors in `setTimeout` / `setInterval` callbacks.
- Rejected promises from `useEffect` async work.
- Event handler errors (these surface to the host; in yokai's case, the input dispatcher).

Wrap async work explicitly and route failure to state:

```tsx
function Loader({ load }: { load: () => Promise<Data> }) {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'data'; data: Data } | { kind: 'error'; error: Error }
  >({ kind: 'loading' })

  useEffect(() => {
    load()
      .then(data => setState({ kind: 'data', data }))
      .catch(error => setState({ kind: 'error', error }))
  }, [load])

  if (state.kind === 'error') return <Text color="red">{state.error.message}</Text>
  if (state.kind === 'loading') return <Text>Loading...</Text>
  return <View data={state.data} />
}
```

## Process-level errors

`uncaughtException` and `unhandledRejection` are not auto-handled by yokai. The consumer owns this. Recommended pattern in a CLI entry point:

```ts
import { render } from '@yokai/renderer'

const instance = render(<App />)

const onFatal = (error: unknown) => {
  process.stderr.write(`[fatal] ${error instanceof Error ? error.stack : String(error)}\n`)
  instance.unmount()
  process.exit(1)
}

process.on('uncaughtException', onFatal)
process.on('unhandledRejection', onFatal)

await instance.waitUntilExit()
```

`instance.unmount()` runs the cleanup path: alt-screen exit, mouse-tracking disable, cursor restore, listener removal.

## `useApp().exit(error?)`

Calling `exit()` with no argument unmounts cleanly and resolves the `waitUntilExit()` promise. Calling `exit(error)` rejects it with the supplied error.

```tsx
import { useApp } from '@yokai/renderer'

function App() {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q') exit()
    if (input === 'Q') exit(new Error('Quit with error'))
  })
  // ...
}
```

CLI entry point catching the rejection:

```ts
try {
  const instance = render(<App />)
  await instance.waitUntilExit()
  process.exit(0)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
```

## Mounting failures

`createRoot` is async. Failures during initial render reject the `createRoot()` promise. Wrap the call:

```ts
import { createRoot } from '@yokai/renderer'

try {
  const root = await createRoot(<App />)
  await root.waitUntilExit()
} catch (error) {
  process.stderr.write(`Failed to mount: ${error}\n`)
  process.exit(1)
}
```

This catches: invalid props that throw in a constructor, errors in module-load-time code reachable from the initial tree, terminal capability detection failures.

## What yokai does on its own crashes

On signal-exit (SIGINT, SIGTERM), yokai unconditionally:

- Sends `?1049l` (exit alt-screen).
- Sends `DISABLE_MOUSE_TRACKING`.
- Restores the cursor.

This runs even if the `altScreenActive` flag is stale, because terminal state can drift and a leaked alt-screen leaves the user's terminal unusable. The codes are no-ops when the terminal is already in the correct state, so the unconditional teardown is safe.

This does not run on uncaught exceptions — install your own handler (above) to call `instance.unmount()`.

## Logging from inside the app

Stdout belongs to the renderer. Anything you write to stdout collides with the frame buffer and gets overwritten. Two options:

```ts
// Option 1: stderr
process.stderr.write(`[debug] ${value}\n`)

// Option 2: gated debug logger from @yokai/shared
import { logForDebugging } from '@yokai/shared'
logForDebugging('selected=' + selected, { level: 'debug' })
```

`logForDebugging` is a no-op unless `DEBUG=1` / `DEBUG=true` / `--debug` is set. See [debugging](./debugging.md).

In a separate shell, tail the stderr stream:

```bash
DEBUG=1 node app.js 2> /tmp/yokai.log
tail -f /tmp/yokai.log
```

## Shipping checklist

- [ ] Error boundaries placed at panel granularity, not leaf or root.
- [ ] All `useEffect` async work has `.catch` routing to state.
- [ ] `uncaughtException` and `unhandledRejection` handlers installed in the entry point.
- [ ] Fatal handler calls `instance.unmount()` before `process.exit`.
- [ ] CLI entry catches `waitUntilExit()` rejection and exits non-zero.
- [ ] Logging goes to stderr or `logForDebugging`, never stdout.
- [ ] `useApp().exit(error)` used to surface app-level failures with non-zero exit codes.
- [ ] `createRoot()` call wrapped in try/catch for mount-time failures.

## See also

- [components/error-overview](../components/error-overview.md)
- [hooks/use-app](../hooks/use-app.md)
- [guides/debugging](./debugging.md)
- [concepts/rendering](../concepts/rendering.md)
- [troubleshooting](../troubleshooting.md)
