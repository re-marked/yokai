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

## Next

- [Your first app](your-first-app.md)
- [Project structure](project-structure.md)
