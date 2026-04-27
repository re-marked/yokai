# Testing

How to test components and behavior built on `@yokai/renderer`.

## Test runner

Yokai uses [vitest](https://vitest.dev). Consumer projects should match.

```jsonc
// package.json
{
  "scripts": { "test": "vitest run" },
  "devDependencies": { "vitest": "^2", "@vitest/ui": "^2" }
}
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
  },
})
```

## Pure-helper extraction pattern

Yokai's interactive components extract their math into pure functions and unit-test those directly. The component is a thin shell around them.

| Helper | Component | Source |
|--------|-----------|--------|
| `computeDraggedPos` | `<Draggable>` | `packages/renderer/src/components/Draggable.tsx` |
| `handleDragPress` | `<Draggable>` | same |
| `computeResizedSize` | `<Resizable>` | `packages/renderer/src/components/Resizable.tsx` |
| `handleResizePress` | `<Resizable>` | same |

Adopt the same shape in consumer code: the side-effecting handler delegates to a pure `(state, event) => nextState` function that takes everything as arguments and returns a value. Tests cover the pure function with table-driven cases; the component test covers only the wiring.

```ts
// productive
export function computeNextSelection(prev: number, key: 'up' | 'down', max: number) {
  if (key === 'up') return Math.max(0, prev - 1)
  return Math.min(max, prev + 1)
}

// inside the component
useInput((input, key) => {
  if (key.upArrow) setSelected((p) => computeNextSelection(p, 'up', items.length - 1))
})
```

```ts
// test
import { computeNextSelection } from './list'
test('clamps at top', () => {
  expect(computeNextSelection(0, 'up', 5)).toBe(0)
})
```

## Testing without rendering through React

For components that hang behavior off DOM-level events, build a hand-rolled DOMElement tree and dispatch events directly. Skips the reconciler, the Yoga calc, the screen diff — only the event path runs.

```ts
import { createNode, appendChildNode, setAttribute } from '@yokai/renderer/dom'
import { dispatchClick } from '@yokai/renderer/events/dispatch'

const root = createNode('ink-root')
const box = createNode('ink-box')
appendChildNode(root, box)
let clicks = 0
setAttribute(box, '_eventHandlers', { onClick: () => clicks++ })

dispatchClick(box, { col: 0, row: 0, cellIsBlank: false })
expect(clicks).toBe(1)
```

Reference test files that demonstrate this pattern end-to-end:

- `packages/renderer/src/components/Draggable.test.tsx` — mouse-event lifecycle on a built tree
- `packages/renderer/src/drag-registry.test.ts` — pure registry operations
- `packages/renderer/src/focus.test.ts` — FocusManager state transitions

Invoke event class methods (e.g. `event.stopImmediatePropagation()`, `event.captureGesture(...)`) on instances you construct directly — they have no React dependency.

## When to test through React

Render a real tree via `render()` from `@yokai/renderer` only when the React state plumbing is the unit under test — cross-component prop flow, context propagation, hook lifecycle. For everything else (event dispatch, layout math, geometry helpers, registry behavior), the pure-helper + hand-built DOM path is faster and stricter.

```ts
import { render } from '@yokai/renderer'
import { PassThrough } from 'node:stream'

const stdout = new PassThrough() as unknown as NodeJS.WriteStream
const instance = await render(<App />, { stdout, patchConsole: false, exitOnCtrlC: false })
// drive input via stdin / inspect frames via onFrame
instance.unmount()
```
