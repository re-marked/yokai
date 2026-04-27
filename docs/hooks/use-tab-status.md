# useTabStatus

Declaratively set the terminal tab-status indicator (OSC 21337).

## Import
```tsx
import { useTabStatus, type TabStatusKind } from '@yokai/renderer'
```

## Signature
```tsx
function useTabStatus(kind: TabStatusKind | null): void

type TabStatusKind = 'idle' | 'busy' | 'waiting'
```

## Parameters
| Field | Type | Description |
|-------|------|-------------|
| `kind` | `TabStatusKind \| null` | Status preset. `null` opts out and clears any previously-set status. |

## Presets
| Kind | Indicator color | Status text |
|------|-----------------|-------------|
| `idle` | green (`#00d75f`) | `Idle` |
| `busy` | orange (`#ff9500`) | `Working…` |
| `waiting` | blue (`#5f87ff`) | `Waiting` |

Wrapped for tmux/screen passthrough. Terminals without OSC 21337 silently discard the sequence — safe to call unconditionally. Transition from non-null to `null` emits `CLEAR_TAB_STATUS` so a stale dot is not left behind. Process-exit cleanup is handled by `ink.tsx`'s unmount path.

## Example
```tsx
function App({ working }: { working: boolean }) {
  useTabStatus(working ? 'busy' : 'idle')
  return <Body />
}
```

### Conditional opt-out
```tsx
useTabStatus(showStatusInTerminalTab ? state : null)
```

## When to use
- Surface foreground/background activity in the terminal app's tab strip.
- Pair with [`useTerminalTitle`](./use-terminal-title.md) for richer tab presence.

## Related
- [`useTerminalTitle`](./use-terminal-title.md)
- `termio/osc.ts`

## Source
[`packages/renderer/src/hooks/use-tab-status.ts`](../../packages/renderer/src/hooks/use-tab-status.ts)
