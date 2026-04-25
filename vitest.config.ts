import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // **/node_modules — not just root — because pnpm symlinks workspace
    // packages into each consumer's node_modules, and a test in
    // packages/shared/src/foo.test.ts would otherwise also be discovered
    // through packages/renderer/node_modules/@yokai/shared/src/foo.test.ts
    // and run twice.
    exclude: ['**/node_modules/**', '**/dist/**'],
    include: ['packages/*/src/**/*.test.ts'],
  },
})

