/**
 * Lightweight debug logging for @yokai packages.
 */

export type DebugLogLevel = 'verbose' | 'debug' | 'info' | 'warn' | 'error'

let debugEnabled =
  process.env.DEBUG === '1' || process.env.DEBUG === 'true' || process.argv.includes('--debug')

export function enableDebugLogging(): void {
  debugEnabled = true
}

export function logForDebugging(
  message: string,
  { level }: { level: DebugLogLevel } = { level: 'debug' },
): void {
  if (!debugEnabled) return
  const timestamp = new Date().toISOString()
  process.stderr.write(`${timestamp} [${level.toUpperCase()}] ${message.trim()}\n`)
}
