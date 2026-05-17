/** Public barrel for `<Surface>`. Consumers import from
 *  `@yokai-tui/renderer` — see `packages/renderer/src/index.ts` for the
 *  package-level re-exports. */

export { default as Surface } from './Surface.js'
export type { SurfaceElevation, SurfaceLayer, SurfaceProps } from './types.js'
export { resolveZIndex } from './layer.js'
export { type ShadowCell, type ShadowRect, shadowCells } from './shadow.js'
