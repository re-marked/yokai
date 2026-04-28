/**
 * Tests for the OSC 52 clipboard helper. Verifies the sequence shape
 * the terminal receives, the env-gated native fallback dispatch, and
 * the tmux DCS-passthrough wrapping. The helper has shipped untested
 * since it was written; this file closes that gap so the cut/copy
 * primitive in TextInput can build on top of it confidently.
 */

import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock is hoisted before any imports/variables, so declare the
// spy via `vi.hoisted` (which is also hoisted) and reference it from
// inside the factory. Importing the spy from a hoisted block keeps
// it usable in test bodies further down.
const { execFileNoThrow } = vi.hoisted(() => ({
  execFileNoThrow: vi.fn(async () => ({ stdout: '', stderr: '', code: 0 })),
}))

vi.mock('@yokai/shared', async () => {
  const actual = await vi.importActual<typeof import('@yokai/shared')>('@yokai/shared')
  return {
    ...actual,
    execFileNoThrow,
  }
})

import {
  RESET_CURSOR_COLOR,
  _resetLinuxCopyCache,
  formatCursorColor,
  setClipboard,
  setCursorColor,
} from './osc.js'

const ESC = '\x1b'
const BEL = '\x07'

async function withPlatform(
  platform: NodeJS.Platform,
  fn: () => void | Promise<void>,
): Promise<void> {
  // Object.defineProperty is the only way to stub process.platform — it's
  // defined as a non-writable getter on the process object, so simple
  // assignment silently no-ops in strict mode.
  //
  // CRITICAL: must `await fn()` inside the try, not `return fn()`. The
  // latter returns the Promise synchronously, finally restores the
  // platform, and then the Promise resolves AFTER the restore — so any
  // awaited platform read inside fn would see the original value, not
  // the stubbed one.
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  try {
    await fn()
  } finally {
    Object.defineProperty(process, 'platform', original)
  }
}

describe('setClipboard', () => {
  beforeEach(() => {
    execFileNoThrow.mockClear()
    execFileNoThrow.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
    _resetLinuxCopyCache()
    vi.stubEnv('TMUX', '')
    vi.stubEnv('SSH_CONNECTION', '')
    vi.stubEnv('LC_TERMINAL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('OSC 52 sequence shape', () => {
    it('returns ESC ] 52 ; c ; <base64> BEL outside tmux', async () => {
      // Outside tmux, no DCS wrapping. `c` selects clipboard (vs `p` for
      // X11 primary). Default terminator is BEL on non-kitty terminals,
      // which covers the overwhelming majority. (kitty switches to ST
      // inside the osc() helper itself; that's covered by the osc()
      // helper's own behavior.)
      const text = 'hello world'
      const expectedB64 = Buffer.from(text, 'utf8').toString('base64')
      const seq = await setClipboard(text)
      expect(seq).toBe(`${ESC}]52;c;${expectedB64}${BEL}`)
    })

    it('base64-encodes UTF-8 multibyte characters correctly', async () => {
      // Surrogate-pair emoji + CJK exercise the UTF-8 → base64 path.
      // A regression here would land the wrong bytes in the user's
      // clipboard — silent corruption.
      const text = '😀中文'
      const expectedB64 = Buffer.from(text, 'utf8').toString('base64')
      const seq = await setClipboard(text)
      expect(seq).toContain(expectedB64)
    })

    it('handles empty string without producing malformed sequence', async () => {
      // Empty paste from clipboard or empty selection → still emit a
      // valid sequence. Base64 of empty is empty; the OSC params
      // `52;c;` end where the terminator begins.
      const seq = await setClipboard('')
      expect(seq).toBe(`${ESC}]52;c;${BEL}`)
    })
  })

  describe('tmux DCS passthrough wrapping', () => {
    it('wraps the OSC 52 sequence in DCS passthrough when TMUX is set', async () => {
      // tmux load-buffer succeeds (mock returns code 0); takes the
      // wrapped-passthrough branch. The wrapper format is
      // `ESC P tmux ; <inner with ESCs doubled> ESC \`. Inner OSC uses
      // BEL (not ST) per the helper docstring.
      vi.stubEnv('TMUX', '/tmp/tmux-1000/default,1234,0')
      const text = 'hi'
      const b64 = Buffer.from(text, 'utf8').toString('base64')
      const seq = await setClipboard(text)
      // Doubled ESCs inside the DCS payload.
      const inner = `${ESC}${ESC}]52;c;${b64}${BEL}`
      expect(seq).toBe(`${ESC}Ptmux;${inner}${ESC}\\`)
    })

    it('falls back to raw OSC 52 if tmux load-buffer fails', async () => {
      // tmux available but load-buffer returns non-zero (unusual; e.g.
      // missing buffer name). Falls through to the raw OSC 52 path.
      // SSH_CONNECTION set so copyNative doesn't fire — keeps
      // execFileNoThrow's only call as the tmux one we want to fail.
      vi.stubEnv('TMUX', '/tmp/tmux-1000/default,1234,0')
      vi.stubEnv('SSH_CONNECTION', '10.0.0.1 1234 192.168.1.1 22')
      execFileNoThrow.mockResolvedValueOnce({ stdout: '', stderr: 'fail', code: 1 })
      const text = 'x'
      const seq = await setClipboard(text)
      expect(seq).toBe(`${ESC}]52;c;${Buffer.from('x', 'utf8').toString('base64')}${BEL}`)
    })
  })

  describe('native fallback dispatch', () => {
    it('skips native fallback when SSH_CONNECTION is set', async () => {
      // Over SSH, pbcopy/wl-copy/clip would write to the REMOTE
      // machine's clipboard — wrong target. OSC 52 routes to the user's
      // local terminal. Gate uses SSH_CONNECTION (not SSH_TTY) because
      // tmux panes inherit SSH_TTY forever.
      vi.stubEnv('SSH_CONNECTION', '10.0.0.1 1234 192.168.1.1 22')
      await setClipboard('over-ssh')
      expect(execFileNoThrow).not.toHaveBeenCalled()
    })

    it('fires pbcopy on darwin', async () => {
      await withPlatform('darwin', async () => {
        await setClipboard('mac-clip')
        expect(execFileNoThrow).toHaveBeenCalledWith(
          'pbcopy',
          [],
          expect.objectContaining({ input: 'mac-clip' }),
        )
      })
    })

    it('fires clip on win32', async () => {
      await withPlatform('win32', async () => {
        await setClipboard('win-clip')
        expect(execFileNoThrow).toHaveBeenCalledWith(
          'clip',
          [],
          expect.objectContaining({ input: 'win-clip' }),
        )
      })
    })

    it('probes wl-copy first on linux (Wayland-preferred)', async () => {
      // On a fresh process (cache reset above), the linux branch tries
      // wl-copy first. If wl-copy succeeds, it's cached as the winner.
      // Subsequent calls go straight to wl-copy without re-probing.
      await withPlatform('linux', async () => {
        await setClipboard('linux-clip')
        expect(execFileNoThrow).toHaveBeenCalledWith(
          'wl-copy',
          [],
          expect.objectContaining({ input: 'linux-clip' }),
        )
      })
    })

    it('caches the linux probe winner across calls', async () => {
      // Once wl-copy succeeds, the cache short-circuits subsequent
      // probes. Two setClipboard calls → exactly two execFileNoThrow
      // calls (no extra xclip/xsel probing on the second).
      await withPlatform('linux', async () => {
        execFileNoThrow.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
        await setClipboard('first')
        // First call schedules the probe asynchronously; await one tick
        // so the .then() resolves and caches 'wl-copy'.
        await new Promise((r) => setImmediate(r))
        execFileNoThrow.mockClear()
        await setClipboard('second')
        expect(execFileNoThrow).toHaveBeenCalledTimes(1)
        expect(execFileNoThrow).toHaveBeenCalledWith(
          'wl-copy',
          [],
          expect.objectContaining({ input: 'second' }),
        )
      })
    })
  })
})

describe('formatCursorColor', () => {
  it('passes hex colors through unchanged', () => {
    expect(formatCursorColor('#00ff00')).toBe('#00ff00')
    expect(formatCursorColor('#abc123')).toBe('#abc123')
  })

  it('converts rgb(...) to #rrggbb', () => {
    expect(formatCursorColor('rgb(0,255,0)')).toBe('#00ff00')
    expect(formatCursorColor('rgb(255, 128, 64)')).toBe('#ff8040')
  })

  it('clamps rgb components to a byte (defensive — should never be > 255)', () => {
    // & 0xff truncates rather than throws; verifies the formatter
    // doesn't silently emit malformed hex if someone passes 300.
    expect(formatCursorColor('rgb(300,0,0)')).toBe('#2c0000') // 300 & 0xff = 44 = 0x2c
  })

  it('strips the ansi: prefix from yokai-style named colors', () => {
    expect(formatCursorColor('ansi:cyan')).toBe('cyan')
    expect(formatCursorColor('ansi:redBright')).toBe('redBright')
  })

  it('passes named colors / theme keys / arbitrary strings through', () => {
    // The terminal interprets these (or doesn't); not our problem.
    expect(formatCursorColor('red')).toBe('red')
    expect(formatCursorColor('dodgerblue')).toBe('dodgerblue')
    expect(formatCursorColor('some-theme-key')).toBe('some-theme-key')
  })

  it('passes ansi256 through (documented unsupported by OSC 12)', () => {
    // Terminals will probably ignore — there's no OSC 12 ansi256
    // syntax. Documented behavior; tested so a future "convert to RGB"
    // change is intentional, not accidental.
    expect(formatCursorColor('ansi256(15)')).toBe('ansi256(15)')
  })
})

describe('setCursorColor', () => {
  it('wraps the formatted color in OSC 12', () => {
    expect(setCursorColor('#00ff00')).toBe(`${ESC}]12;#00ff00${BEL}`)
  })

  it('formats rgb(...) before wrapping', () => {
    expect(setCursorColor('rgb(255,0,128)')).toBe(`${ESC}]12;#ff0080${BEL}`)
  })

  it('strips ansi: prefix before wrapping', () => {
    expect(setCursorColor('ansi:magenta')).toBe(`${ESC}]12;magenta${BEL}`)
  })
})

describe('RESET_CURSOR_COLOR', () => {
  it('is the OSC 112 sequence with no payload', () => {
    expect(RESET_CURSOR_COLOR).toBe(`${ESC}]112${BEL}`)
  })
})
