/**
 * Lightweight debug logging for @yokai packages.
 */

import { isEnvTruthy } from './envUtils'

export type DebugLogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error'

let debugEnabledOverride = false

function isDebugEnabled(): boolean {
  return debugEnabledOverride || isEnvTruthy(process.env.DEBUG) || process.argv.includes('--debug')
}

export function enableDebugLogging(): void {
  debugEnabledOverride = true
}

export function disableDebugLogging(): void {
  debugEnabledOverride = false
}

export function logForDebugging(
  message: string,
  { level }: { level: DebugLogLevel } = { level: 'debug' },
): void {
  if (!isDebugEnabled()) return
  const timestamp = new Date().toISOString()
  process.stderr.write(`${timestamp} [${level.toUpperCase()}] ${message.trim()}\n`)
}
