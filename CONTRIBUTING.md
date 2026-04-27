# Contributing to yokai

Yokai is a foundation library — claude-corp and other downstream consumers depend on its stability. The rules below are non-negotiable. Apply them on every commit, every PR, every feature.

## Branching and merging

- **Never commit directly to `main`.** Every change starts on a branch cut from `main`.
- **Open a PR into `main`** when ready.
- **Merge with normal merge commits only.** Never rebase-merge. Never squash-merge. The full commit graph is preserved on purpose — future debugging and refactoring depend on it.

## Commits

- **Granular and frequent.** One logical change = one commit. If you're about to commit two unrelated things, split them.
- **No "WIP" commits, no batched-up commits.** A commit should always pass CI on its own.

## Quality bar

- If there's any sense that "doing it the harder way will be harder now but better long-term" — do it the better way. Even if it takes more time.
- No rushed or underdeveloped solutions. No spaghetti.
- New public API gets tests. Bug fixes get a regression test that fails on the parent commit and passes on the fix.
- Prefer extracting pure helpers (e.g. `computeDraggedPos`, `computeResizedSize`, `handleDragPress`) so behavior can be tested without spinning up React.

## Local checks before opening a PR

```bash
pnpm install
pnpm build       # shared → renderer (always in this order)
pnpm typecheck
pnpm lint
pnpm test
```

CI runs all four on every push and PR (`.github/workflows/ci.yml`). A red CI on a PR is a hard blocker — fix the underlying issue, never bypass.

## Versioning and releases

Yokai follows [semver](https://semver.org/):

- **patch** (`0.4.x`) — bug fixes that don't change public API
- **minor** (`0.x.0`) — new public API, new components, new exported types
- **major** (`x.0.0`) — breaking changes (none yet on the `0.x` line)

`@yokai/renderer` and `@yokai/shared` move in lockstep — when one bumps, the other bumps to the same version. Root `package.json` syncs too.

Releases are cut **on demand**. The flow:

1. Branch `release/vX.Y.Z` cut from `main`.
2. Bump version in root + `packages/renderer/package.json` + `packages/shared/package.json`.
3. Open a PR with release notes summarising what's in this version (link to merged PRs by number).
4. Merge the release PR.
5. Tag `vX.Y.Z` from `main` (`git tag -a vX.Y.Z -m "..."` + `git push origin vX.Y.Z`).
6. Publish a GitHub release with the same notes.

Consumers pin via git ref:

```jsonc
"dependencies": {
  "@yokai/renderer": "github:re-marked/yokai#vX.Y.Z"
}
```

No npm publishing for now — that's an option for later if the consumer set grows beyond the current monorepo neighbours.

## When in doubt

Read [`CLAUDE.md`](./CLAUDE.md) for the "things to know before changing things" — invariants in the renderer / event system / selection that are easy to break and hard to debug. Cross-reference with the relevant test files (`*.test.ts(x)` next to the source) before touching subtle pipeline code.
