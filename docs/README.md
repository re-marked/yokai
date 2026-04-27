# Yokai documentation

Start at [Getting Started](getting-started/install.md) if you're new; jump to a [Component](components/) or [Hook](hooks/) reference for API details.

```
docs/
├── README.md
├── AGENTS.md
├── troubleshooting.md
├── faq.md
├── changelog.md
├── getting-started/
│   ├── install.md
│   ├── your-first-app.md
│   └── project-structure.md
├── concepts/
│   ├── layout.md
│   ├── rendering.md
│   ├── events.md
│   ├── mouse.md
│   ├── keyboard.md
│   ├── focus.md
│   ├── text.md
│   ├── colors.md
│   ├── selection.md
│   ├── scrolling.md
│   ├── state.md
│   ├── performance.md
│   └── terminals.md
├── components/
│   ├── box.md
│   ├── text.md
│   ├── scrollbox.md
│   ├── alternate-screen.md
│   ├── link.md
│   ├── button.md
│   ├── raw-ansi.md
│   ├── no-select.md
│   ├── error-overview.md
│   ├── draggable.md
│   ├── drop-target.md
│   ├── resizable.md
│   ├── focus-group.md
│   └── focus-ring.md
├── hooks/
│   ├── use-input.md
│   ├── use-app.md
│   ├── use-stdin.md
│   ├── use-terminal-viewport.md
│   ├── use-terminal-focus.md
│   ├── use-focus.md
│   ├── use-focus-manager.md
│   ├── use-interval.md
│   ├── use-animation-frame.md
│   ├── use-selection.md
│   ├── use-search-highlight.md
│   ├── use-tab-status.md
│   ├── use-declared-cursor.md
│   └── use-terminal-title.md
├── patterns/
│   ├── keyboard-menu.md
│   ├── sortable-list.md
│   ├── kanban-board.md
│   ├── modal.md
│   ├── resizable-panes.md
│   ├── autocomplete.md
│   ├── table.md
│   ├── file-tree.md
│   ├── log-viewer.md
│   ├── chat-ui.md
│   ├── confirmation-dialog.md
│   └── indicators.md
├── guides/
│   ├── migration-from-ink.md
│   ├── testing.md
│   ├── debugging.md
│   ├── accessibility.md
│   ├── streaming-content.md
│   └── error-handling.md
├── reference/
│   ├── types.md
│   ├── styles.md
│   ├── events.md
│   └── cli.md
└── internals/
    ├── architecture.md
    ├── reconciler.md
    ├── yoga-port.md
    ├── render-pipeline.md
    ├── selection-state-machine.md
    ├── drag-registry.md
    └── focus-manager.md
```

### Getting Started

- [Install](getting-started/install.md)
- [Your first app](getting-started/your-first-app.md)
- [Project structure](getting-started/project-structure.md)

### Concepts

- [Layout](concepts/layout.md)
- [Rendering](concepts/rendering.md)
- [Events](concepts/events.md)
- [Mouse](concepts/mouse.md)
- [Keyboard](concepts/keyboard.md)
- [Focus](concepts/focus.md)
- [Text](concepts/text.md)
- [Colors](concepts/colors.md)
- [Selection](concepts/selection.md)
- [Scrolling](concepts/scrolling.md)
- [State](concepts/state.md)
- [Performance](concepts/performance.md)
- [Terminals](concepts/terminals.md)

### Components

- [Box](components/box.md)
- [Text](components/text.md)
- [ScrollBox](components/scrollbox.md)
- [AlternateScreen](components/alternate-screen.md)
- [Link](components/link.md)
- [Button](components/button.md)
- [RawAnsi](components/raw-ansi.md)
- [NoSelect](components/no-select.md)
- [ErrorOverview](components/error-overview.md)
- [Draggable](components/draggable.md)
- [DropTarget](components/drop-target.md)
- [Resizable](components/resizable.md)
- [FocusGroup](components/focus-group.md)
- [FocusRing](components/focus-ring.md)

### Hooks

- [useInput](hooks/use-input.md)
- [useApp](hooks/use-app.md)
- [useStdin](hooks/use-stdin.md)
- [useTerminalViewport](hooks/use-terminal-viewport.md)
- [useTerminalFocus](hooks/use-terminal-focus.md)
- [useFocus](hooks/use-focus.md)
- [useFocusManager](hooks/use-focus-manager.md)
- [useInterval](hooks/use-interval.md)
- [useAnimationFrame](hooks/use-animation-frame.md)
- [useSelection](hooks/use-selection.md)
- [useSearchHighlight](hooks/use-search-highlight.md)
- [useTabStatus](hooks/use-tab-status.md)
- [useDeclaredCursor](hooks/use-declared-cursor.md)
- [useTerminalTitle](hooks/use-terminal-title.md)

### Patterns

- [Keyboard menu](patterns/keyboard-menu.md)
- [Sortable list](patterns/sortable-list.md)
- [Kanban board](patterns/kanban-board.md)
- [Modal](patterns/modal.md)
- [Resizable panes](patterns/resizable-panes.md)
- [Autocomplete](patterns/autocomplete.md)
- [Table](patterns/table.md)
- [File tree](patterns/file-tree.md)
- [Log viewer](patterns/log-viewer.md)
- [Chat UI](patterns/chat-ui.md)
- [Confirmation dialog](patterns/confirmation-dialog.md)
- [Indicators (spinners + progress bars)](patterns/indicators.md)

### Guides

- [Migration from Ink](guides/migration-from-ink.md)
- [Testing](guides/testing.md)
- [Debugging](guides/debugging.md)
- [Accessibility](guides/accessibility.md)
- [Streaming content](guides/streaming-content.md)
- [Error handling](guides/error-handling.md)

### Reference

- [Types](reference/types.md)
- [Styles](reference/styles.md)
- [Events](reference/events.md)
- [CLI / render APIs](reference/cli.md)

### Internals

For contributors to yokai itself, and consumers reasoning about renderer behavior.

- [Architecture](internals/architecture.md)
- [Reconciler](internals/reconciler.md)
- [Yoga port](internals/yoga-port.md)
- [Render pipeline](internals/render-pipeline.md)
- [Selection state machine](internals/selection-state-machine.md)
- [Drag registry](internals/drag-registry.md)
- [Focus manager](internals/focus-manager.md)

### Meta

- [AGENTS.md](AGENTS.md) — guide for AI assistants writing code that uses yokai
- [Troubleshooting](troubleshooting.md) — runtime failures and fixes
- [FAQ](faq.md) — frequently asked questions
- [Changelog](changelog.md) — versioned release notes
