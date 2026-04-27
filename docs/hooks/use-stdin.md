# useStdin

Access the stdin stream and raw-mode controls.

## Import
```tsx
import { useStdin } from '@yokai/renderer'
```

## Signature
```tsx
function useStdin(): {
  stdin: NodeJS.ReadStream
  setRawMode: (value: boolean) => void
  isRawModeSupported: boolean
  internal_exitOnCtrlC: boolean
  internal_eventEmitter: EventEmitter
  internal_querier: TerminalQuerier | null
}
```

## Returns
| Field | Type | Description |
|-------|------|-------------|
| `stdin` | `NodeJS.ReadStream` | Stream from `render(opts.stdin)` or `process.stdin`. |
| `setRawMode` | `(value: boolean) => void` | Toggle raw mode. Use this rather than `stdin.setRawMode` so Ink can keep its Ctrl+C handling intact. No-op when raw mode is unsupported. |
| `isRawModeSupported` | `boolean` | Whether the current stream supports raw mode (false in pipes / non-TTY environments). |
| `internal_exitOnCtrlC` | `boolean` | Mirrors `render({ exitOnCtrlC })`. Read by `useInput` to know whether to suppress Ctrl+C. |
| `internal_eventEmitter` | `EventEmitter` | Internal bus emitting `'input'` `InputEvent`s. Subscribe at your own risk; ordering matters. |
| `internal_querier` | `TerminalQuerier \| null` | Send queries (DECRQM, OSC 11, etc.) and await responses. |

## Examples
### Fallback when raw mode is unsupported
```tsx
const { isRawModeSupported } = useStdin()
if (!isRawModeSupported) return <Text>Run in a TTY for interactive mode.</Text>
return <Menu />
```

### Manual stream listener
```tsx
const { stdin, setRawMode } = useStdin()
useEffect(() => {
  setRawMode(true)
  const onData = (chunk: Buffer) => log(chunk.toString())
  stdin.on('data', onData)
  return () => { stdin.off('data', onData); setRawMode(false) }
}, [stdin, setRawMode])
```

## When to use
Most consumers should use [`useInput`](./use-input.md). Reach for `useStdin` only for raw-stream listeners, raw-mode capability checks, or terminal querying.

## Related
- [`useInput`](./use-input.md) — parsed keyboard input.

## Source
[`packages/renderer/src/hooks/use-stdin.ts`](../../packages/renderer/src/hooks/use-stdin.ts)
