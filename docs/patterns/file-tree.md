# File Tree

Collapsible nested tree of files and folders. Reach for this when building a file picker, a project explorer, or any hierarchical browser.

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

type Node = { name: string; path: string; children?: Node[] }

const ROOT: Node = {
  name: 'project',
  path: '/project',
  children: [
    {
      name: 'src',
      path: '/project/src',
      children: [
        { name: 'index.ts', path: '/project/src/index.ts' },
        {
          name: 'components',
          path: '/project/src/components',
          children: [
            { name: 'Box.tsx', path: '/project/src/components/Box.tsx' },
            { name: 'Text.tsx', path: '/project/src/components/Text.tsx' },
          ],
        },
      ],
    },
    {
      name: 'tests',
      path: '/project/tests',
      children: [{ name: 'box.test.ts', path: '/project/tests/box.test.ts' }],
    },
    { name: 'package.json', path: '/project/package.json' },
    { name: 'README.md', path: '/project/README.md' },
  ],
}

type Visible = { node: Node; depth: number; isDir: boolean; isOpen: boolean }

function flatten(node: Node, depth: number, expanded: Map<string, boolean>, out: Visible[]): void {
  const isDir = !!node.children
  const isOpen = isDir && expanded.get(node.path) === true
  out.push({ node, depth, isDir, isOpen })
  if (isOpen && node.children) {
    for (const c of node.children) flatten(c, depth + 1, expanded, out)
  }
}

function App(): React.ReactNode {
  const { exit } = useApp()
  const { focused } = useFocusManager()
  const [expanded, setExpanded] = useState<Map<string, boolean>>(
    () => new Map([[ROOT.path, true]]),
  )
  const [chosen, setChosen] = useState<string | null>(null)

  const visible = useMemo(() => {
    const out: Visible[] = []
    flatten(ROOT, 0, expanded, out)
    return out
  }, [expanded])

  function toggle(path: string, open: boolean): void {
    setExpanded((prev) => {
      const next = new Map(prev)
      next.set(path, open)
      return next
    })
  }

  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
    const label = focused?.attributes.label
    if (typeof label !== 'string') return
    const row = visible.find((v) => v.node.path === label)
    if (!row) return
    if (key.rightArrow && row.isDir && !row.isOpen) toggle(row.node.path, true)
    if (key.leftArrow && row.isDir && row.isOpen) toggle(row.node.path, false)
    if (key.return) {
      if (row.isDir) toggle(row.node.path, !row.isOpen)
      else setChosen(row.node.path)
    }
  })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" padding={1}>
        <Text bold>file tree</Text>
        <Text dim>Tab/arrows to move, →/← expand/collapse, Enter selects, q quits</Text>

        <Box marginTop={1}>
          <FocusGroup direction="column" wrap flexDirection="column">
            {visible.map((row) => {
              const indent = '  '.repeat(row.depth)
              const glyph = row.isDir ? (row.isOpen ? 'v' : '>') : ' '
              const icon = row.isDir ? '/' : ''
              return (
                <FocusRing key={row.node.path} label={row.node.path}>
                  <Box paddingX={1}>
                    <Text>
                      {indent}
                      <Text dim>{glyph} </Text>
                      <Text color={row.isDir ? 'cyan' : undefined}>
                        {row.node.name}
                        {icon}
                      </Text>
                    </Text>
                  </Box>
                </FocusRing>
              )
            })}
          </FocusGroup>
        </Box>

        <Box marginTop={1}>
          <Text>opened: <Text bold>{chosen ?? '—'}</Text></Text>
        </Box>
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
```

## How it works

1. **Tree is data, view is flat**: `flatten` walks the tree depth-first and emits one `Visible` row per currently-shown node, carrying its `depth` so indentation falls out of `'  '.repeat(depth)`. Collapsed subtrees never enter the array.
2. **Expansion state as a Map keyed by path**: `Map<string, boolean>` survives unrelated re-renders and keeps a closed branch closed when its parent re-opens. Mutating via copy-and-set keeps React's identity check honest.
3. **One `<FocusGroup direction="column" wrap>` over the flattened list**: ↑/↓ moves between visible rows regardless of depth. Wrapping ends the loop at top/bottom. Tab also walks the same set in tree order.
4. **`<FocusRing label={path}>` carries identity**: the keyboard handler looks the focused path up in `visible` to know whether the row is a directory and whether it's open — no separate ref map.
5. **Right/left split from Enter**: → expands a closed dir, ← collapses an open one; Enter toggles dirs and selects files. Matches conventions from VS Code's explorer and `tree -L`.
6. **Glyph + icon**: `>`/`v` shows expand state for dirs, trailing `/` marks dir names, `cyan` tints them. Files render plain — no clutter on the common case.
7. **Mouse clicks focus a row**: re-pressing Enter (or re-clicking) toggles a dir or selects a file. Same dispatch path as the keyboard.

## Variations

- **Lazy children**: replace `node.children?: Node[]` with `loadChildren?: () => Promise<Node[]>`. On first expand, kick the loader and stash results in a `Map<string, Node[]>`; render a `loading...` placeholder row in the meantime.
- **Multi-select**: track a `Set<string>` of checked paths; Space toggles; render `[x]` before the glyph.
- **Filter / search**: take a query and prune `flatten` to nodes whose path matches or whose subtree contains a match. Auto-expand ancestors of matches.
- **Drag to move**: wrap each row in `<Draggable>` and each directory in `<DropTarget>` with an `accept` filter; on drop, splice the node into its new parent.
- **Long trees**: wrap the row list in `<ScrollBox height={N}>` and `scrollToElement` on the focused row when it leaves the viewport.
- **Icons by extension**: branch on `node.name.split('.').pop()` for file glyphs (`.ts`, `.md`, `.json`).

## Related

- [`FocusGroup`](../components/focus-group.md)
- [`FocusRing`](../components/focus-ring.md)
- [`useFocusManager`](../hooks/use-focus-manager.md)
- [`useInput`](../hooks/use-input.md)
- [Keyboard menu pattern](./keyboard-menu.md) — flat-list precursor to this tree.
