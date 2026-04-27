# Styles reference

Every property on the `Styles` type. Source: `packages/renderer/src/styles.ts`.

`Styles` is read by `<Box>` (and components built on it) and applied to a Yoga layout node. All properties are optional and `readonly`.

## Layout

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `position` | `'absolute' \| 'relative'` | `'relative'` | Absolute removes the node from flex flow |
| `top` | `number \| ` `` `${number}%` `` | `NaN` (unset) | Cell offset or percent of parent |
| `bottom` | `number \| ` `` `${number}%` `` | `NaN` | |
| `left` | `number \| ` `` `${number}%` `` | `NaN` | |
| `right` | `number \| ` `` `${number}%` `` | `NaN` | |
| `zIndex` | `number` | `0` | Only honored on `position: 'absolute'`. Per-parent stacking. Negative paints under in-flow content. Dev warning fires on non-absolute nodes |
| `width` | `number \| string` | auto | Cells; `'50%'` = percent of parent |
| `height` | `number \| string` | auto | Lines; percent supported |
| `minWidth` | `number \| string` | `0` | |
| `minHeight` | `number \| string` | `0` | |
| `maxWidth` | `number \| string` | unbounded | |
| `maxHeight` | `number \| string` | unbounded | |

## Flex

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `flexDirection` | `'row' \| 'column' \| 'row-reverse' \| 'column-reverse'` | `'column'` | Yoga default |
| `flexGrow` | `number` | `0` | |
| `flexShrink` | `number` | `0` | **Differs from CSS / Ink (which default to 1).** Pass `1` to enable shrinking |
| `flexBasis` | `number \| string` | `NaN` | Cells or percent string |
| `flexWrap` | `'nowrap' \| 'wrap' \| 'wrap-reverse'` | `'nowrap'` | |
| `alignItems` | `'flex-start' \| 'center' \| 'flex-end' \| 'stretch'` | `'stretch'` | Cross-axis |
| `alignContent` | (via Yoga node API) | `'flex-start'` | Multi-line cross-axis distribution |
| `alignSelf` | `'flex-start' \| 'center' \| 'flex-end' \| 'auto'` | `'auto'` | |
| `justifyContent` | `'flex-start' \| 'flex-end' \| 'space-between' \| 'space-around' \| 'space-evenly' \| 'center'` | `'flex-start'` | Main-axis |
| `gap` | `number` | `0` | Shorthand for `columnGap` + `rowGap` |
| `columnGap` | `number` | `0` | |
| `rowGap` | `number` | `0` | |

## Spacing

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `margin` | `number` | `0` | All four edges |
| `marginX` | `number` | `0` | Left + right |
| `marginY` | `number` | `0` | Top + bottom |
| `marginTop` | `number` | `0` | |
| `marginBottom` | `number` | `0` | |
| `marginLeft` | `number` | `0` | |
| `marginRight` | `number` | `0` | |
| `padding` | `number` | `0` | All four edges |
| `paddingX` | `number` | `0` | |
| `paddingY` | `number` | `0` | |
| `paddingTop` | `number` | `0` | |
| `paddingBottom` | `number` | `0` | |
| `paddingLeft` | `number` | `0` | |
| `paddingRight` | `number` | `0` | |

## Border

Set `borderStyle` to enable a 1-cell border on all four sides. Per-edge booleans toggle individual sides off.

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `borderStyle` | `BorderStyle` (`'single' \| 'double' \| 'round' \| 'bold' \| 'classic' \| 'singleDouble' \| 'doubleSingle' \| ...`) | undefined | Undefined = no border |
| `borderTop` | `boolean` | `true` | Hides top edge when `false` |
| `borderBottom` | `boolean` | `true` | |
| `borderLeft` | `boolean` | `true` | |
| `borderRight` | `boolean` | `true` | |
| `borderColor` | `Color` | terminal default | Shorthand for all four edge colors |
| `borderTopColor` | `Color` | inherits `borderColor` | |
| `borderBottomColor` | `Color` | inherits | |
| `borderLeftColor` | `Color` | inherits | |
| `borderRightColor` | `Color` | inherits | |
| `borderDimColor` | `boolean` | `false` | Shorthand to dim all edges |
| `borderTopDimColor` | `boolean` | `false` | |
| `borderBottomDimColor` | `boolean` | `false` | |
| `borderLeftDimColor` | `boolean` | `false` | |
| `borderRightDimColor` | `boolean` | `false` | |
| `borderText` | `BorderTextOptions` | undefined | Inline label embedded in top or bottom border |

## Visual

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `backgroundColor` | `Color` | terminal default | Fills box interior, inherits to child text as default bg |
| `opaque` | `boolean` | `false` | Fills with spaces using terminal-default bg (no SGR). Use for absolute overlays where padding/gaps would otherwise be transparent |
| `display` | `'flex' \| 'none'` | `'flex'` | `'none'` removes the node from layout |
| `overflow` | `'visible' \| 'hidden' \| 'scroll'` | `'visible'` | `'scroll'` constrains size and enables `scrollTop` translation |
| `overflowX` | `'visible' \| 'hidden' \| 'scroll'` | inherits `overflow` | Horizontal axis |
| `overflowY` | `'visible' \| 'hidden' \| 'scroll'` | inherits `overflow` | Vertical axis |
| `textWrap` | `'wrap' \| 'wrap-trim' \| 'end' \| 'middle' \| 'truncate-end' \| 'truncate' \| 'truncate-middle' \| 'truncate-start'` | `'wrap'` | Applies to `<Text>` content. Box accepts the prop but strips it before forwarding |

## Selection

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `noSelect` | `boolean \| 'from-left-edge'` | `false` | Excludes cells from alt-screen text selection. `'from-left-edge'` extends exclusion from column 0 to the box's right edge for every row it occupies — covers upstream indentation so multi-row drags don't pick up leading whitespace |
