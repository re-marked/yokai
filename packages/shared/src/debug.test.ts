import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { disableDebugLogging, enableDebugLogging, logForDebugging } from './debug'

describe('logForDebugging', () => {
  let originalDebug: string | undefined
  let stderrWrite: MockInstance<typeof process.stderr.write>

  beforeEach(() => {
    originalDebug = process.env.DEBUG
    Reflect.deleteProperty(process.env, 'DEBUG')
    disableDebugLogging()
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    if (originalDebug === undefined) {
      Reflect.deleteProperty(process.env, 'DEBUG')
    } else {
      process.env.DEBUG = originalDebug
    }
    disableDebugLogging()
    stderrWrite.mockRestore()
  })

  it('does not write when debugging is disabled', () => {
    logForDebugging('quiet')

    expect(stderrWrite).not.toHaveBeenCalled()
  })

  it('re-reads DEBUG on each call', () => {
    logForDebugging('before')
    process.env.DEBUG = '1'
    logForDebugging('after')

    expect(stderrWrite).toHaveBeenCalledTimes(1)
    expect(String(stderrWrite.mock.calls[0]?.[0])).toContain('[DEBUG] after')
  })

  it('accepts trimmed truthy DEBUG values', () => {
    process.env.DEBUG = ' true '

    logForDebugging('trimmed')

    expect(stderrWrite).toHaveBeenCalledTimes(1)
    expect(String(stderrWrite.mock.calls[0]?.[0])).toContain('[DEBUG] trimmed')
  })

  it('can be enabled and disabled at runtime', () => {
    enableDebugLogging()
    logForDebugging('enabled')

    disableDebugLogging()
    logForDebugging('disabled')

    expect(stderrWrite).toHaveBeenCalledTimes(1)
    expect(String(stderrWrite.mock.calls[0]?.[0])).toContain('[DEBUG] enabled')
  })
})
