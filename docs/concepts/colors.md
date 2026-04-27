# Colors

Yokai accepts color values in four typed formats plus terminal capability detection that downgrades when needed.

## Color formats

`Color` is a union of four shapes plus a `string` escape hatch for theme keys:

```ts
type RGBColor     = `rgb(${number},${number},${number})`
type HexColor     = `#${string}`           // '#1a2b3c'
type Ansi256Color = `ansi256(${number})`   // 'ansi256(214)'
type AnsiColor    = `ansi:${name}`         // 'ansi:cyan', 'ansi:redBright'
```

Plain unprefixed names (`'cyan'`, `'red'`, `'gray'`) also work — `colorize` falls back to the ANSI palette for the 8 base colors plus `gray`/`grey`.

```tsx
<Text color="#1a2b3c">truecolor</Text>
<Text color="rgb(215,119,87)">truecolor</Text>
<Text color="ansi256(214)">256-color</Text>
<Text color="ansi:cyanBright">named ANSI</Text>
<Text color="cyan">named ANSI (short)</Text>
```

## Choosing a format

- **Hex / RGB**: brand colors, theme tokens. Requires truecolor (chalk level 3).
- **ansi256**: a stable palette across terminals, no truecolor required. The 6×6×6 cube and 24-step grayscale cover most UI needs.
- **ansi:*** named: the safest fallback, renders consistently in every terminal including legacy Windows conhost. Bright variants (`ansi:redBright`) are slightly less portable than the base 8.

## Capability detection

`colorize.ts` adjusts chalk's level on module load:

- **xterm.js boost** (`TERM_PROGRAM=vscode`, level 2): bump to level 3. VS Code / Cursor / code-server support truecolor but `supports-color` doesn't recognize them, so without this `chalk.rgb()` would downgrade brand colors to the nearest 6×6×6 cube entry (e.g. Claude orange → washed-out salmon).
- **tmux clamp** (`$TMUX` set, level > 2): clamp to level 2. tmux only forwards truecolor to the outer terminal when configured with `terminal-overrides ,*:Tc`; without it, bg colors get dropped. Override via `CLAUDE_CODE_TMUX_TRUECOLOR=1` if your tmux is configured for passthrough.

Both decisions are computed once at load. The exported flags `CHALK_BOOSTED_FOR_XTERMJS` and `CHALK_CLAMPED_FOR_TMUX` are available for debugging.

## See also
- [Terminals](../concepts/terminals.md)
- [Text](../components/text.md)
