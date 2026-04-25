import { transformAsync } from '@babel/core'
import { readFile } from 'node:fs/promises'
import type { Plugin } from 'esbuild'
import { defineConfig } from 'tsup'

/**
 * esbuild plugin that pre-processes .tsx files through Babel with the
 * React Compiler before letting esbuild handle the rest of the pipeline.
 *
 * Why a custom plugin instead of esbuild-plugin-babel: that plugin runs
 * AFTER esbuild's JSX transform, so by the time Babel sees the code it's
 * already React.createElement(...) calls. The React Compiler needs to see
 * the original JSX to recognize component boundaries. Running our own
 * loader before esbuild's default .tsx loader keeps the JSX intact.
 *
 * The Babel pipeline:
 *   - @babel/preset-typescript: strip TS annotations (esbuild would do
 *     this otherwise; doing it in Babel keeps the AST consistent)
 *   - babel-plugin-react-compiler: wrap component bodies in the
 *     useMemoCache scaffold ($ = _c(N), conditional cache reads, etc.)
 *   - @babel/preset-react with runtime: 'automatic': lower JSX to the
 *     react/jsx-runtime API, matching tsconfig's "jsx": "react-jsx"
 *
 * Output is JS that esbuild bundles normally. The compiler runs once at
 * build time; nothing ships at runtime beyond the standard
 * react/compiler-runtime (~1KB) re-exported from React 19.
 */
function reactCompilerPlugin(): Plugin {
  return {
    name: 'react-compiler',
    setup(build) {
      build.onLoad({ filter: /\.tsx$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8')
        const result = await transformAsync(source, {
          filename: args.path,
          presets: [
            ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
            ['@babel/preset-react', { runtime: 'automatic' }],
          ],
          plugins: [
            ['babel-plugin-react-compiler', { target: '19' }],
          ],
          sourceMaps: 'inline',
          // Don't read user's .babelrc — keep this build self-contained.
          babelrc: false,
          configFile: false,
        })
        if (!result?.code) {
          throw new Error(`react-compiler plugin: empty output for ${args.path}`)
        }
        return { contents: result.code, loader: 'js' }
      })
    },
  }
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  external: ['react', 'react-reconciler'],
  esbuildPlugins: [reactCompilerPlugin()],
})
