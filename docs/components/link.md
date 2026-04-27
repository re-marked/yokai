# Link

Wraps children in an OSC 8 terminal hyperlink, with a plain-text fallback for terminals that do not support hyperlinks.

## Import
```tsx
import { Link } from '@yokai/renderer'
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `url` | `string` | — | Target URL emitted in the OSC 8 sequence |
| `children` | `ReactNode` | `url` | Display content; defaults to the URL itself |
| `fallback` | `ReactNode` | `children ?? url` | Rendered instead of the link when the terminal does not support OSC 8 |

## Examples

### Basic
```tsx
<Link url="https://github.com/re-marked/yokai">yokai</Link>
```

### With fallback
```tsx
<Link url="https://example.com" fallback={<Text dim>example.com</Text>}>
  example
</Link>
```

## Behavior

- Renders inside an implicit `<Text>` wrapper — safe to use anywhere a `<Text>` is valid.
- Hyperlink support is detected once via `supportsHyperlinks()`, which inspects `TERM_PROGRAM`, `VTE_VERSION`, CI flags, and known-good terminal versions.
- Supported terminals include iTerm2, modern VTE-based emulators (GNOME Terminal, Tilix), Kitty, WezTerm, Windows Terminal, and Alacritty (recent versions).
- Unsupported / unknown terminals receive `fallback ?? children ?? url` as plain text.
- The hyperlink is emitted as a single OSC 8 span; styling (color, bold, etc.) is taken from the surrounding `<Text>` context.

## Related
- [Text](text.md)

## Source
[`packages/renderer/src/components/Link.tsx`](../../packages/renderer/src/components/Link.tsx)
