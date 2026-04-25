import { logForDebugging } from '@yokai/shared'
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
