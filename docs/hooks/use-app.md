# useApp

Access app-level actions from inside the React tree.

## Import
```tsx
import { useApp } from '@yokai/renderer'
```

## Signature
```tsx
function useApp(): { exit: (error?: Error) => void }
```

## Returns
| Field | Type | Description |
|-------|------|-------------|
| `exit` | `(error?: Error) => void` | Unmount the app. If `error` is supplied, the `render()` promise rejects with it; otherwise resolves. |

## Examples
### Quit on `q`
```tsx
function App() {
  const { exit } = useApp()
  useInput((input) => { if (input === 'q') exit() })
  return <Text>press q to quit</Text>
}
```

### Exit with error
```tsx
const { exit } = useApp()
try { await loadConfig() } catch (err) { exit(err as Error) }
```

## When to use
Any component that needs to terminate the render. Pair with `useInput` for keyboard quit.

## Related
- [Your first app](../getting-started/your-first-app.md) — the `render()` returned promise resolves/rejects per `exit()`.

## Source
[`packages/renderer/src/hooks/use-app.ts`](../../packages/renderer/src/hooks/use-app.ts)
