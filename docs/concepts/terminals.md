# Terminals

Yokai targets modern xterm-compatible terminals; this page documents which capabilities are used, how they're detected, and where compatibility is partial.

## Modes used

| DEC mode | Purpose | Sequence |
|----------|---------|----------|
| 1049 | Alt-screen with save/restore | `CSI ?1049h` / `l` |
| 1000 | Mouse press/release/wheel | `CSI ?1000h` |
| 1002 | Mouse drag (button-motion) | `CSI ?1002h` |
| 1003 | All-motion (hover) | `CSI ?1003h` |
| 1006 | SGR mouse format | `CSI ?1006h` |
| 1004 | Focus in/out events | `CSI ?1004h` |
| 2004 | Bracketed paste | `CSI ?2004h` |
| 2026 | Synchronized output (BSU/ESU) | `CSI ?2026h` |
| 25 | Cursor visibility | `CSI ?25h` / `l` |

`AlternateScreen` enters mode 1049 and the combined mouse-tracking suite (1000 + 1002 + 1003 + 1006). Exit is unconditional on signal-exit because the `altScreenActive` flag can be stale; `?1049l` is a no-op when already on the main screen.

## True color

Detection runs at module load (`colorize.ts`) and adjusts chalk's level:

- `TERM_PROGRAM=vscode` at level 2 is boosted to level 3 (xterm.js supports truecolor but isn't recognized by `supports-color`).
- `$TMUX` at level > 2 is clamped to level 2 unless `CLAUDE_CODE_TMUX_TRUECOLOR=1` is set, because default tmux drops truecolor bg sequences.

See [Colors](../concepts/colors.md) for format choices.

## OSC 8 hyperlinks

`<Link>` emits OSC 8 (`ESC ] 8 ; ; URL ESC \`). Detection extends `supports-hyperlinks` with explicit checks for ghostty, Hyper, kitty, alacritty, iTerm2, and `LC_TERMINAL` (preserved through tmux). Terminals without OSC 8 render the label text without a clickable link.

## DECSCUSR cursor shape

`useDeclaredCursor` emits `CSI N q` to request a cursor shape (block / underline / bar, steady or blinking). Most modern terminals honor it; some legacy or web-based terminals ignore it silently.

## DEC 2026 synchronized output

`isSynchronizedOutputSupported()` returns true for iTerm2, WezTerm, Warp, ghostty, contour, vscode, alacritty, kitty (via `KITTY_WINDOW_ID`), foot, Zed (`ZED_TERM`), Windows Terminal (`WT_SESSION`), and VTE 0.68+. When supported, frame writes are wrapped in BSU/ESU to prevent visible tearing on multi-byte updates.

tmux is excluded: it parses BSU/ESU and proxies them, but chunks output before forwarding so atomicity is already broken — emitting them costs 16 bytes per frame for no benefit.

## OSC 9;4 progress

`isProgressReportingAvailable()` returns true for ConEmu (all versions), ghostty 1.2.0+, and iTerm2 3.6.6+. Windows Terminal is explicitly excluded because it interprets OSC 9;4 as a notification rather than a progress indicator.

## Tested terminal matrix

Active development targets: iTerm2, ghostty, kitty, WezTerm, alacritty, Windows Terminal, vscode (xterm.js), and tmux running inside any of the above.

Known partial-support cases:
- **vscode xterm.js wheel events** — the integrated terminal emits wheel events differently than native terminals; `parseMouse` handles the variant but edge cases (very fast scroll, modifier combinations) may behave inconsistently.
- **Windows conhost (legacy)** — pre-Windows-Terminal conhost has limited xterm compatibility. Yokai assumes Windows Terminal or ConEmu on Windows; behavior on legacy conhost is not tested and not supported.
- **tmux truecolor** — see Colors page; defaults to clamped 256-color unless explicitly configured for passthrough.
- **SSH sessions** — `TERM_PROGRAM` is not forwarded, so terminal detection falls back to async XTVERSION queries (`CSI > 0 q`) over the pty. Detection is best-effort during the first frame.

Compatibility outside this matrix is not promised.

## See also
- [Colors](../concepts/colors.md)
- [AlternateScreen](../components/alternate-screen.md)
- [Link](../components/link.md)
