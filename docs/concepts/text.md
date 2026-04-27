# Text

`<Text>` is the only leaf that produces visible characters; it owns wrapping, truncation, ANSI styling, and OSC 8 hyperlinks.

## Basics

```tsx
<Text color="green" bold>hello</Text>
```

Style props: `color`, `backgroundColor`, `bold`, `dim`, `italic`, `underline`, `strikethrough`, `inverse`. `bold` and `dim` are mutually exclusive at the type level — terminals cannot render both.

`color` and `backgroundColor` accept `#rrggbb`, `rgb(r,g,b)`, `ansi256(n)`, or `ansi:red` / `ansi:redBright` etc. Bare strings pass through as theme keys.

## Wrap modes

```tsx
<Text wrap="wrap">long text...</Text>
<Text wrap="truncate-end">long text...</Text>
```

| `wrap` value | Effect |
|---|---|
| `'wrap'` (default) | Soft-wrap on word boundaries |
| `'wrap-trim'` | Soft-wrap, trim trailing whitespace per line |
| `'end'` / `'middle'` | Single-line, fold marker at position |
| `'truncate-end'` (alias `'truncate'`) | One line, ellipsis at end |
| `'truncate-middle'` | One line, ellipsis in the middle |
| `'truncate-start'` | One line, ellipsis at start |

Truncation uses `…` (one cell). The `<Text>` flex item is set to `flexGrow: 0`, `flexShrink: 1`, `flexDirection: 'row'` so it shrinks under width pressure rather than overflowing.

## Grapheme clusters and width

Width is measured per grapheme cluster, not per code point. Combining marks (`é` as `e + ◌́`), regional-indicator pairs (flags), ZWJ-joined emoji families, and skin-tone modifiers each count as one cluster of width 1 or 2. `wrap-text.ts` and `widest-line.ts` (via `line-width-cache`) drive this.

## Wide characters

CJK ideographs, fullwidth forms, and most emoji are width 2. The screen buffer stores them as a `WideHead` cell followed by a `SpacerTail` cell, so a single grapheme occupies exactly two columns. Hit-testing, hyperlink lookup, and selection unify the pair: clicking the spacer resolves to the head cell.

## ANSI passthrough

Pre-rendered ANSI strings should use `<RawAnsi>`:

```tsx
<RawAnsi lines={ansiLines} width={80} />
```

This bypasses the `<Ansi>` parse → React tree → Yoga → squash → re-serialize roundtrip. The component emits a single Yoga leaf with a constant-time measure func (`width × lines.length`) and hands the joined string to `output.write()`, which parses ANSI directly into the screen buffer. Use this for syntax-highlighted diffs and other content that arrives terminal-ready.

The producer must wrap each line to exactly `width` columns. Yoga uses `width` as the leaf's measured size; rows wider than `width` corrupt downstream layout.

## OSC 8 hyperlinks

```tsx
<Link url="https://example.com">click me</Link>
```

When `supportsHyperlinks()` returns true, the link writes OSC 8 enter/exit sequences around the children. Cells inside carry a hyperlink-pool ID; the diff tracks hyperlink boundaries and emits OSC 8 transitions only at the edges of a link region, not per cell. When unsupported, the `fallback` (or the URL) renders as plain text.

## See also
- [Rendering](../concepts/rendering.md)
- [Text](../components/text.md)
- [RawAnsi](../components/raw-ansi.md)
- [Link](../components/link.md)
