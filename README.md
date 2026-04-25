# Yokai

React terminal renderer — pure TypeScript Yoga layout, diff-based rendering, ScrollBox.

Built for [Claude Corp](https://github.com/re-marked/claude-corp), forked from [claude-code-kit](https://github.com/minnzen/claude-code-kit)

## Packages

| Package | Description |
|---------|-------------|
| `@yokai/renderer` | React reconciler, terminal rendering, components (Box, Text, ScrollBox) |
| `@yokai/shared` | Yoga layout engine (pure TS), text measurement, ANSI utilities |

## Install

```bash
pnpm add @yokai/renderer @yokai/shared react
```

## Usage

```tsx
import { render, Box, Text, ScrollBox } from '@yokai/renderer';

function App() {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <ScrollBox stickyScroll flexGrow={1}>
        <Text color="#E07B56">Hello from Yokai</Text>
      </ScrollBox>
    </Box>
  );
}

await render(<App />);
```

## License

MIT
