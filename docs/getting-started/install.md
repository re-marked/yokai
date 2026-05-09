# Install

Install yokai in a consumer project.

## Peer dependencies

| Package | Version |
|---------|---------|
| `react` | `^19.2.5` |
| `node`  | `>=22`  |

## From npm (canonical)

```sh
pnpm add @yokai-tui/renderer react
# or
npm install @yokai-tui/renderer react
```

`@yokai-tui/shared` is pulled in transitively. Add it explicitly only if you import its symbols directly.

See [release notes](https://github.com/re-marked/yokai/releases) for what changed in each version.

## From a GitHub tag

If you prefer pinning to source instead of npm:

```jsonc
{
  "dependencies": {
    "@yokai-tui/renderer": "github:re-marked/yokai#v0.7.1",
    "react": "^19.2.5"
  }
}
```

Pin to a tag. `main` moves and breaks consumers between commits.

## Monorepo workspace (first-party)

For first-party consumers (claude-corp and similar), depend on the workspace package directly:

```jsonc
// package.json
{
  "dependencies": {
    "@yokai-tui/renderer": "workspace:*"
  }
}
```

With pnpm:

```bash
pnpm add @yokai-tui/renderer --workspace
```

After install, build the workspace once (only needed for workspace / GitHub-tag consumers — npm tarballs ship pre-built):

```bash
pnpm install
pnpm build
```

Subsequent `pnpm build` runs are incremental.

## Local-checkout development (`link:`)

If you're developing a consumer app side-by-side with a local yokai checkout (not a monorepo workspace, not an npm install), use `link:` paths in your consumer's `package.json`:

```jsonc
{
  "dependencies": {
    "@yokai-tui/renderer": "link:../yokai/packages/renderer",
    "@yokai-tui/shared": "link:../yokai/packages/shared",
    // CRITICAL — also link react and react-reconciler from yokai's
    // node_modules. See the "React singleton" note below.
    "react": "link:../yokai/packages/renderer/node_modules/react",
    "react-reconciler": "link:../yokai/packages/renderer/node_modules/react-reconciler"
  }
}
```

### Why the explicit react / react-reconciler link

Yokai's renderer declares `react` and `react-reconciler` as PEER dependencies. With a normal npm install, the consumer's app and yokai resolve to the SAME `react` instance (npm dedups peers). With `link:`, they resolve to DIFFERENT module instances — the consumer's `node_modules/react` and yokai's `node_modules/react` are two separate copies.

React enforces a per-module-instance dispatcher singleton. When yokai's renderer creates a Context (`FocusContext`, `TerminalSizeContext`, etc.) using its copy of `react`, and the consumer's component reads it via `useContext` using the consumer's copy of `react`, the singletons don't match — `useContext` returns `null` for everything yokai-provided. Symptoms:

- `useFocus` returns `{ ref: <noop>, isFocused: false, focus: <noop> }`
- `useTerminalViewport` returns no dimensions
- Cursor declarations don't fire
- `<FocusGroup>` doesn't cycle on Tab

The fix is to force the consumer's `react` and `react-reconciler` to resolve to yokai's copies via the explicit `link:` paths above. After this, both sides share one module instance and React's internal checks pass.

### Verify the fix worked

After `pnpm install`, check:

```sh
ls -la node_modules/react node_modules/@yokai-tui/renderer/node_modules/react
```

Both should be symlinks pointing to the same target (yokai's `react`). If they're separate directories, the dedup didn't take — re-check the `link:` paths.

### Real-world example

Termos (the testbed app) uses exactly this shape — see [`termos/package.json`](https://github.com/re-marked/termos/blob/main/package.json) for a working reference.

## Next

- [Your first app](your-first-app.md)
- [Project structure](project-structure.md)
