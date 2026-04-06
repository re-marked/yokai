# @yokai/renderer

React terminal renderer — reconciler, Yoga Flexbox layout, keyboard/mouse events, ANSI output.

## Install

```bash
pnpm add @yokai/renderer react
```

## Usage

```tsx
import { render, Box, Text } from '@yokai/renderer'

await render(
  <Box padding={1}>
    <Text bold color="green">Hello from Yokai</Text>
  </Box>
)
```

## Features

- Pure TypeScript Yoga layout (no WASM/native bindings)
- Diff-based terminal rendering
- ScrollBox with sticky scroll
- Full keyboard + mouse event system
- React 18+ reconciler

## License

MIT
