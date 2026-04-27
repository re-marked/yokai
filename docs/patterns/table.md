# Table

Tabular data with column headers and rows. Reach for this when you need to show records: process lists, query results, file listings.

## Code

```tsx
import {
  AlternateScreen,
  Box,
  FocusGroup,
  FocusRing,
  Text,
  render,
  useApp,
  useFocusManager,
  useInput,
} from '@yokai/renderer'
import type React from 'react'
import { useMemo, useState } from 'react'

type Row = { id: string; name: string; status: 'open' | 'merged' | 'closed'; size: number }

const COLS: { key: keyof Row; label: string; width: number; align?: 'right' }[] = [
  { key: 'id', label: 'id', width: 6 },
  { key: 'name', label: 'name', width: 28 },
  { key: 'status', label: 'status', width: 10 },
  { key: 'size', label: 'size', width: 8, align: 'right' },
]

const STATUS_COLOR: Record<Row['status'], string> = {
  open: 'green',
  merged: 'magenta',
  closed: 'red',
}

const ROWS: Row[] = [
  { id: '#42', name: 'fix scrollbox clamp race', status: 'open', size: 124 },
  { id: '#43', name: 'rework yoga free path', status: 'merged', size: 980 },
  { id: '#44', name: 'add z-index sort', status: 'merged', size: 312 },
  { id: '#45', name: 'wheel events in alt-screen', status: 'open', size: 88 },
  { id: '#46', name: 'drop double-render on resize', status: 'closed', size: 41 },
]

function Cell({
  value,
  width,
  align,
}: {
  value: string
  width: number
  align?: 'right'
}): React.ReactNode {
  return (
    <Box width={width} paddingX={1} justifyContent={align === 'right' ? 'flex-end' : 'flex-start'}>
      <Text>{value}</Text>
    </Box>
  )
}

function App(): React.ReactNode {
  const { exit } = useApp()
  const { focused } = useFocusManager()
  const [sortKey, setSortKey] = useState<keyof Row>('id')
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const [chosen, setChosen] = useState<string | null>(null)

  const sorted = useMemo(() => {
    return ROWS.slice().sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av < bv) return -1 * sortDir
      if (av > bv) return 1 * sortDir
      return 0
    })
  }, [sortKey, sortDir])

  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
    if (key.return && focused?.attributes.label) {
      const label = String(focused.attributes.label)
      if (label.startsWith('row:')) setChosen(label.slice(4))
      if (label.startsWith('hdr:')) {
        const k = label.slice(4) as keyof Row
        if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1))
        else {
          setSortKey(k)
          setSortDir(1)
        }
      }
    }
  })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" padding={1}>
        <Text bold>pull requests</Text>
        <Text dim>Tab to move, Enter on header to sort, Enter on row to select, q quits</Text>

        <Box marginTop={1} flexDirection="column">
          <FocusGroup direction="row" flexDirection="row">
            {COLS.map((c) => (
              <FocusRing key={c.key} label={`hdr:${c.key}`}>
                <Box width={c.width} paddingX={1}>
                  <Text bold>
                    {c.label}
                    {sortKey === c.key ? (sortDir === 1 ? ' ^' : ' v') : ''}
                  </Text>
                </Box>
              </FocusRing>
            ))}
          </FocusGroup>

          <FocusGroup direction="column" wrap flexDirection="column">
            {sorted.map((r) => (
              <FocusRing key={r.id} label={`row:${r.id}`}>
                <Box flexDirection="row">
                  <Cell value={r.id} width={COLS[0]!.width} />
                  <Cell value={r.name} width={COLS[1]!.width} />
                  <Box width={COLS[2]!.width} paddingX={1}>
                    <Text color={STATUS_COLOR[r.status]}>{r.status}</Text>
                  </Box>
                  <Cell value={String(r.size)} width={COLS[3]!.width} align="right" />
                </Box>
              </FocusRing>
            ))}
          </FocusGroup>
        </Box>

        <Box marginTop={1}>
          <Text>selected: <Text bold>{chosen ?? '—'}</Text></Text>
        </Box>
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
```

## How it works

1. **Column schema as data**: `COLS` declares key, label, width, and optional alignment. Headers and rows both walk the same schema, so widths stay aligned without magic numbers in two places.
2. **Fixed widths via `<Box width={n}>`**: each cell is a Box with a hard width and `paddingX={1}` for breathing room. `flexBasis` works too, but fixed widths give predictable terminal columns and cheaper layout.
3. **Two `<FocusGroup>`s, one tree**: header group uses `direction="row"` (←/→ between header buttons); row group uses `direction="column"` with `wrap` (↑/↓ cycles rows). Tab still walks both groups linearly.
4. **`<FocusRing label="...">` tags identity**: the Enter handler reads `focused.attributes.label` and dispatches on the `hdr:` / `row:` prefix. No per-cell callbacks, no ref maps.
5. **Sort state lives outside the row list**: `useMemo` sorts a copy on `(sortKey, sortDir)` change. Repeated Enter on the same header flips direction; pressing a new header resets to ascending.
6. **Status color**: `STATUS_COLOR` lookup keeps row rendering branch-free; new statuses extend the table without a switch.
7. **Mouse clicks on a row or header focus it**: the same Enter dispatch then runs naturally — table is keyboard- and mouse-driven from one code path.

## Variations

- **Selectable multi-row** (checkbox column): add a `Set<string>` of selected ids; render `[x]` / `[ ]` in the first cell; Space toggles instead of Enter.
- **Resizable columns**: wrap each header `<Box>` in `<Resizable axis="x">` and lift `width` into state keyed by column id.
- **Long tables**: wrap the row group in `<ScrollBox height={20}>`. Yokai doesn't ship a virtualisation hook — all rows are still in the React tree, but viewport culling means only visible rows reach the screen buffer. Scales to a few thousand rows because the diff is per-cell.
- **Per-row actions menu**: on Enter, mount a `<Modal>` with row-specific actions instead of just recording the id.
- **Dynamic columns**: derive `COLS` from the first row's keys; use `flexGrow: 1` on a single "name" column to let it stretch and keep the rest fixed.
- **Striped rows**: alternate `backgroundColor` per row index for legibility on dense tables.

## Related

- [`FocusGroup`](../components/focus-group.md)
- [`FocusRing`](../components/focus-ring.md)
- [`useFocusManager`](../hooks/use-focus-manager.md)
- [`useInput`](../hooks/use-input.md)
- [`ScrollBox`](../components/scrollbox.md) — for long tables.
- [Keyboard menu pattern](./keyboard-menu.md) — same focus-and-Enter mechanism in one column.
