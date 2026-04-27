# ErrorOverview

Renders an error fallback with message, source location, code excerpt, and parsed stack frames.

## Import
```tsx
import { ErrorOverview } from '@yokai/renderer'
```

## Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `error` | `Error` | required | The error to display. `error.stack` drives source-file lookup and stack-frame rendering. |

## Examples
### As error boundary fallback
```tsx
<ErrorBoundary fallback={(error) => <ErrorOverview error={error} />}>
  <App />
</ErrorBoundary>
```

## Behavior
- Parses `error.stack` with `stack-utils` to extract the originating file/line/column.
- Reads the source file synchronously via `fs.readFileSync` and uses `code-excerpt` to show context around the failing line. Read failure is silent (excerpt is skipped).
- The failing line is highlighted with `ansi:red` background / `ansi:white` foreground.
- File paths are stripped of the `file://${cwd}/` prefix before display.
- Stack frames that fail to parse are printed verbatim.
- App's default error boundary renders this component on unhandled child errors.

## Related
- [`Box`](./box.md)
- [`Text`](./text.md)

## Source
[`packages/renderer/src/components/ErrorOverview.tsx`](../../packages/renderer/src/components/ErrorOverview.tsx)
