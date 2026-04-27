# Project structure

Recommended layout for a yokai app.

## Top-level App component

One root component owns global concerns: alt-screen entry, top-level keyboard shortcuts, focus manager wiring, error boundaries. Children render features.

```tsx
function App() {
  return (
    <AlternateScreen mouseTracking>
      <Shell>
        <Sidebar />
        <Main />
      </Shell>
    </AlternateScreen>
  )
}

render(<App />)
```

## Per-feature components

Group by feature, not by component type. A feature directory holds the component, its hooks, its types, and its tests together. Cross-feature primitives (a shared `<StatusBar>`) live one level up.

## Hooks

Reusable hooks colocate with the component that owns them. Cross-feature hooks (`useDebouncedSearch`, `useShortcut`) live in a top-level `hooks/` directory.

## Tests

Colocate `Component.test.tsx` next to `Component.tsx`. Yokai itself does this; consumers benefit from the same locality.

## Entry point

Keep the entry small. It mounts `<App />` and wires `process.on('SIGINT')` if the consumer wants custom shutdown — yokai handles the default.

```tsx
// src/index.tsx
import { render } from '@yokai/renderer'
import { App } from './app'

render(<App />)
```
