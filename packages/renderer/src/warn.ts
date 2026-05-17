import { logForDebugging } from '@yokai-tui/shared'
import type { Styles } from './styles'

export function ifNotInteger(value: number | undefined, name: string): void {
  if (value === undefined) return
  if (Number.isInteger(value)) return
  logForDebugging(`${name} should be an integer, got ${value}`, {
    level: 'warn',
  })
}

/**
 * Warn when `zIndex` is set on a node that isn't `position: 'absolute'`.
 * The renderer silently ignores zIndex on in-flow / relative nodes (they
 * don't overlap, so paint order has no meaning), but a user setting it
 * usually expects something to happen — without a warning they'd
 * silently end up with the wrong layout.
 *
 * Gated by `logForDebugging` so it's a no-op in production unless the
 * user has explicitly enabled debug logging via environment variable.
 */
export function ifZIndexWithoutAbsolute(style: Styles): void {
  if (style.zIndex === undefined) return
  if (style.position === 'absolute') return
  logForDebugging(
    `zIndex={${style.zIndex}} is set on a node with position=${
      style.position ?? 'undefined (in-flow)'
    } — zIndex only applies to position: 'absolute' nodes and is silently ignored otherwise. Either set position: 'absolute' or remove the zIndex prop.`,
    { level: 'warn' },
  )
}

// ── A23 Surface: dev warnings for misuse on non-absolute Surfaces ─────
//
// Three orthogonal Surface features (`hitTestBoundary`, `elevation`,
// `backdrop`) only make sense on `position: 'absolute'` Surfaces —
// applying them to a relative Surface would either be ignored (boundary,
// elevation: the renderer gates on absolute) or wreak havoc on sibling
// layout (an in-flow backdrop fragment would shift its siblings). Each
// warning identifies which flag triggered it so consumers can find and
// fix the call site without sorting through neighboring props.
//
// Same gating as `ifZIndexWithoutAbsolute`: `logForDebugging` is a
// no-op in production unless debug logging is explicitly enabled,
// so the warnings stay free at runtime and visible during development.

/** Warn when `<Surface hitTestBoundary>` is set on a non-absolute Surface. */
export function ifHitTestBoundaryWithoutAbsolute(
  hitTestBoundary: boolean | undefined,
  position: 'relative' | 'absolute' | undefined,
): void {
  if (hitTestBoundary !== true) return
  if (position === 'absolute') return
  logForDebugging(
    `<Surface hitTestBoundary> is set on a Surface with position=${
      position ?? 'undefined (relative)'
    } — hitTestBoundary is only honored on position: 'absolute' Surfaces and is silently ignored otherwise. Either set position="absolute" or remove the hitTestBoundary prop.`,
    { level: 'warn' },
  )
}

/** Warn when `<Surface elevation>` is set on a non-absolute Surface. */
export function ifElevationWithoutAbsolute(
  elevation: number | undefined,
  position: 'relative' | 'absolute' | undefined,
): void {
  if (elevation === undefined || elevation === 0) return
  if (position === 'absolute') return
  logForDebugging(
    `<Surface elevation={${elevation}}> is set on a Surface with position=${
      position ?? 'undefined (relative)'
    } — elevation only paints on position: 'absolute' Surfaces (an in-flow shadow would shift sibling layout). Either set position="absolute" or remove the elevation prop.`,
    { level: 'warn' },
  )
}

/** Warn when `<Surface backdrop>` is set on a non-absolute Surface. */
export function ifBackdropWithoutAbsolute(
  backdrop: boolean | undefined,
  position: 'relative' | 'absolute' | undefined,
): void {
  if (backdrop !== true) return
  if (position === 'absolute') return
  logForDebugging(
    `<Surface backdrop> is set on a Surface with position=${
      position ?? 'undefined (relative)'
    } — backdrop renders an auto-sibling scrim Box, which is only meaningful when the Surface is absolute (in-flow placement would shift the parent's layout). Either set position="absolute" or remove the backdrop prop.`,
    { level: 'warn' },
  )
}
