# Install

Install yokai in a consumer project.

Yokai is not published to npm. Consume it as a GitHub dependency pinned to a release tag, or as a workspace package in a monorepo.

## Peer dependencies

| Package | Version |
|---------|---------|
| `react` | `^19.2.5` |
| `node`  | `>=22`  |

## GitHub ref pin (canonical)

```jsonc
// package.json
{
  "dependencies": {
    "@yokai/renderer": "github:re-marked/yokai#v0.5.0",
    "react": "^19.2.5"
  }
}
```

Pin to a tag. `main` moves and breaks consumers between commits. See [release notes](https://github.com/re-marked/yokai/releases) for what changed in each version.

If a project uses both `@yokai/renderer` and `@yokai/shared` directly, pin both to the same tag.

```jsonc
{
  "dependencies": {
    "@yokai/renderer": "github:re-marked/yokai#v0.5.0",
    "@yokai/shared": "github:re-marked/yokai#v0.5.0"
  }
}
```

## Monorepo workspace (first-party)

For first-party consumers (claude-corp and similar), depend on the workspace package directly:

```jsonc
// package.json
{
  "dependencies": {
    "@yokai/renderer": "workspace:*"
  }
}
```

With pnpm:

```bash
pnpm add @yokai/renderer --workspace
```

The shared package is hoisted automatically; explicit dependency is only required if the consumer imports `@yokai/shared` symbols directly.

## Build before use

After install, build the workspace once. Renderer depends on shared:

```bash
pnpm install
pnpm build
```

Subsequent `pnpm build` runs are incremental.

## Next

- [Your first app](your-first-app.md)
- [Project structure](project-structure.md)
