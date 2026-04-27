# useTerminalTitle

Declaratively set the terminal window/tab title.

## Import
```tsx
import { useTerminalTitle } from '@yokai/renderer'
```

## Signature
```tsx
function useTerminalTitle(title: string | null): void
```

## Parameters
| Field | Type | Description |
|-------|------|-------------|
| `title` | `string \| null` | Title to set. ANSI escape sequences are stripped. `null` makes the hook a no-op and leaves the existing title untouched. |

Writes OSC 0 (`SET_TITLE_AND_ICON`) via Ink's stdout. On Windows, sets `process.title` instead because classic conhost does not support OSC.

## Example
```tsx
function App({ project }: { project: string }) {
  useTerminalTitle(`yokai — ${project}`)
  return <Body />
}
```

### Opt out
```tsx
useTerminalTitle(allowTitleOverride ? title : null)
```

## When to use
- Surface session context (project, branch, mode) in the OS window list.
- Pair with [`useTabStatus`](./use-tab-status.md) for terminals that show a separate status indicator.

## Related
- [`useTabStatus`](./use-tab-status.md)
- `termio/osc.ts`

## Source
[`packages/renderer/src/hooks/use-terminal-title.ts`](../../packages/renderer/src/hooks/use-terminal-title.ts)
