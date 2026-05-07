# Layout

Yokai lays out boxes with a pure-TypeScript port of Yoga, with one terminal cell as the unit of measure.

## Cell math

One cell = 1 column wide × 1 row tall. Every dimension — `width`, `height`, `padding`, `margin`, `gap`, `top`/`left`/`right`/`bottom`, border thickness — is integer cells. Borders count as 1 cell on each enabled side.

Percent values (`width: '50%'`, `marginLeft: '10%'`) resolve against the parent's content box at layout time.

## Defaults

These are the consumer-facing defaults applied by `<Box>`. The underlying Yoga port keeps its own native defaults internally, but `<Box>` sets the values most Yokai apps actually see.

| Property | Yokai default | CSS default |
|---|---|---|
| `flexDirection` | `'row'` | `'row'` |
| `flexShrink` | `1` | `1` |
| `alignItems` | `'stretch'` | `'stretch'` |
| `display` | `'flex'` | `'inline'` |

Use `flexDirection="column"` for the common terminal pattern where rows stack vertically. Set `flexShrink={0}` on chrome that must not collapse, such as title bars, footers, and fixed-width sidebars.

## Spacing

```tsx
<Box padding={1} margin={1} gap={1} flexDirection="row">
  <Text>a</Text>
  <Text>b</Text>
</Box>
```

`padding` / `margin` accept `paddingX`, `paddingY`, and per-edge variants (`paddingLeft`, etc.). `gap` is one shorthand for `rowGap` + `columnGap`.

## Absolute positioning

```tsx
<Box position="relative">
  <Box position="absolute" top={0} right={0}>...</Box>
</Box>
```

Absolute children are removed from flow and positioned against the nearest positioned ancestor. Edges accept cells or `${number}%`.

## zIndex

`zIndex` only applies to `position: 'absolute'` nodes. On in-flow or relative nodes it is silently ignored — a dev-mode warning fires from `setStyle`. Stacking is flat per parent: siblings sort by `(effectiveZ, treeOrder)`. Nested z-indexed absolutes sort within their parent's group, not globally. Negative `zIndex` paints under in-flow content (backdrop pattern).

## Overflow

`overflow: 'hidden'` clips children to the container's content box. `overflow: 'scroll'` additionally constrains the container's measured size against its children, enabling `<ScrollBox>` virtualization. Per-axis variants `overflowX` / `overflowY` exist; layout uses the union.

## See also
- [Rendering](../concepts/rendering.md)
- [Box](../components/box.md)
- [ScrollBox](../components/scrollbox.md)
