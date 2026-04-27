# Your first app

Render "Hello, world" and exit on `q`.

```tsx
import { render, Text, useApp, useInput } from '@yokai/renderer'
import type React from 'react'

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input) => {
    if (input === 'q') exit()
  })
  return <Text>Hello, world</Text>
}

render(<App />)
```

## What each piece does

| Symbol | Role |
|--------|------|
| `render` | Mounts a React element to stdout. Returns an `Ink` instance with `unmount`, `waitUntilExit`, `clear`. |
| `useApp` | Hook returning `{ exit }`. Call `exit()` to unmount and release stdin. |
| `useInput` | Hook subscribing to raw keyboard input. Handler receives `(input, key)`. |

## The render loop

Each React commit produces a frame; the renderer diffs against the previous frame and emits the minimal ANSI patch. `render` keeps the process alive until `exit()` runs.

## Exit paths

- `useApp().exit()` — clean unmount.
- `Ctrl+C` — handled by the renderer, calls exit and restores the terminal.

For an interactive example with mouse events and the alternate screen, read [`examples/drag/drag.tsx`](../../examples/drag/drag.tsx).

Read [Project structure](project-structure.md) next, then jump into [Components](../components/).
