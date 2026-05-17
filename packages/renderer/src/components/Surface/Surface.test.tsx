/**
 * Surface component tests.
 *
 * Three layers of coverage:
 *
 *   1. Prop surface — Surface constructs cleanly with every documented
 *      combination of props. Cheap; catches accidental required-prop
 *      regressions without rendering.
 *   2. DOM passthrough — Surface renders to an `ink-box` whose style /
 *      attributes match what the component contract promises. Tested
 *      by mounting via `renderSync` with a fake stdout and inspecting
 *      the rendered DOMElement through a `ref`. This is the truth
 *      source for "did the React shell actually wire X to ink-box?"
 *   3. Dev warnings — the three `ifXWithoutAbsolute` warnings fire
 *      iff the corresponding prop is set on a non-absolute Surface.
 *      Tested by spying on `process.stderr.write` after enabling debug
 *      logging.
 *
 * Behavioral integration (hit-test boundary occlusion, elevation paint,
 * backdrop layering against a peer modal) lives in `hit-test.test.ts`,
 * `render-node-to-output.test.ts`, and ultimately the `examples/surface`
 * demo. This file pins the React/DOM contract; those pin the renderer
 * behavior; the demo is the visual sanity check.
 */

import { PassThrough } from 'node:stream'
import { disableDebugLogging, enableDebugLogging } from '@yokai-tui/shared'
import React, { createRef } from 'react'
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DOMElement } from '../../dom.js'
import { type Instance, renderSync } from '../../root.js'
import Surface from './Surface.js'

// ── shared helpers ───────────────────────────────────────────────────

const instances: Instance[] = []

function fakeStdout(columns = 40, rows = 10): NodeJS.WriteStream {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream
  stdout.columns = columns
  stdout.rows = rows
  stdout.isTTY = false
  return stdout
}

/** Render a single Surface into a fake stdout; return the rendered
 *  DOMElement so tests can inspect its style and attributes. */
function renderAndInspect(node: React.ReactElement): DOMElement {
  const ref = createRef<DOMElement>()
  // cloneElement is loosely typed for arbitrary props; cast the `ref`
  // through to keep TS off our back. Surface forwards ref to ink-box,
  // so this populates after renderSync runs the reconciler.
  const cloned = React.cloneElement(node, { ref } as unknown as Partial<unknown>)
  const instance = renderSync(cloned, {
    stdout: fakeStdout(),
    patchConsole: false,
    exitOnCtrlC: false,
  })
  instances.push(instance)
  if (!ref.current) throw new Error('renderAndInspect: ref was not populated')
  return ref.current
}

afterEach(() => {
  for (const instance of instances.splice(0)) {
    instance.unmount()
    instance.cleanup()
  }
})

// ── 1. Prop-surface constructibility ─────────────────────────────────

describe('Surface — prop surface (constructibility)', () => {
  it('renders with no props at all', () => {
    expect(() => React.createElement(Surface, {})).not.toThrow()
  })

  it('renders with every documented prop in one shot', () => {
    expect(() =>
      React.createElement(Surface, {
        position: 'absolute',
        top: 5,
        left: 10,
        width: 60,
        height: 20,
        layer: 'modal',
        zIndex: 3001,
        borderStyle: 'round',
        borderColor: '#444',
        backgroundColor: '#101820',
        padding: 1,
        clip: 'hidden',
        hitTestBoundary: true,
        elevation: 3,
        backdrop: true,
        backdropColor: 'black',
        tabIndex: 0,
        autoFocus: true,
        claimFocusOnClick: false,
        onClick: () => {},
        onMouseDown: () => {},
        onMouseEnter: () => {},
        onMouseLeave: () => {},
        onFocus: () => {},
        onBlur: () => {},
        onKeyDown: () => {},
      }),
    ).not.toThrow()
  })
})

// ── 2. DOM passthrough ───────────────────────────────────────────────

describe('Surface — style passthrough to ink-box', () => {
  it('default Surface (no layer, no extras) → ink-box with no zIndex and no surface attrs', () => {
    // The "<Surface> with no extras is byte-identical to <Box>" promise.
    // No zIndex on the style, no surfaceHitTestBoundary attribute, no
    // surfaceElevation attribute.
    const node = renderAndInspect(<Surface backgroundColor="cyan" width={10} height={3} />)
    expect(node.style.zIndex).toBeUndefined()
    expect(node.attributes.surfaceHitTestBoundary).toBeUndefined()
    expect(node.attributes.surfaceElevation).toBeUndefined()
    expect(node.style.backgroundColor).toBe('cyan')
    expect(node.style.width).toBe(10)
    expect(node.style.height).toBe(3)
    // Default position is 'relative' — not the same as absent. ink-box
    // still gets the value, but downstream renderer code treats them
    // equivalently for paint / layout.
    expect(node.style.position).toBe('relative')
  })

  it("layer='base' resolves to no zIndex (parity with no-layer)", () => {
    const node = renderAndInspect(<Surface layer="base" position="absolute" />)
    expect(node.style.zIndex).toBeUndefined()
  })

  it("layer='modal' resolves to zIndex 3000 on the rendered ink-box", () => {
    const node = renderAndInspect(<Surface layer="modal" position="absolute" />)
    expect(node.style.zIndex).toBe(3000)
  })

  it("layer='tooltip' resolves to zIndex 5000", () => {
    const node = renderAndInspect(<Surface layer="tooltip" position="absolute" />)
    expect(node.style.zIndex).toBe(5000)
  })

  it('explicit zIndex wins over layer (numeric escape hatch)', () => {
    const node = renderAndInspect(<Surface layer="modal" zIndex={3050} position="absolute" />)
    expect(node.style.zIndex).toBe(3050)
  })

  it("clip='hidden' maps to overflowX/overflowY: 'hidden'", () => {
    const node = renderAndInspect(<Surface clip="hidden" />)
    expect(node.style.overflowX).toBe('hidden')
    expect(node.style.overflowY).toBe('hidden')
  })

  it("clip='visible' does NOT set overflowX/overflowY (defers to Box default)", () => {
    const node = renderAndInspect(<Surface clip="visible" />)
    expect(node.style.overflowX).toBeUndefined()
    expect(node.style.overflowY).toBeUndefined()
  })

  it('explicit overflow prop wins over clip', () => {
    // An overflow={'scroll'} prop set alongside clip='hidden' MUST
    // produce overflow:'scroll', not 'hidden'. Otherwise clip silently
    // shadows the consumer's explicit choice.
    const node = renderAndInspect(<Surface clip="hidden" overflow="scroll" />)
    expect(node.style.overflowX).toBe('scroll')
    expect(node.style.overflowY).toBe('scroll')
  })

  it('hitTestBoundary=true sets the surfaceHitTestBoundary attribute', () => {
    const node = renderAndInspect(<Surface hitTestBoundary position="absolute" />)
    expect(node.attributes.surfaceHitTestBoundary).toBe(true)
  })

  it('hitTestBoundary=false omits the attribute (no false marker)', () => {
    // Setting the attribute to `false` would still take a code path
    // change in hit-test.ts — omitting is cleaner for the "no extras
    // == identical DOM" promise.
    const node = renderAndInspect(<Surface hitTestBoundary={false} position="absolute" />)
    expect(node.attributes.surfaceHitTestBoundary).toBeUndefined()
  })

  it('elevation > 0 sets the surfaceElevation attribute', () => {
    const node = renderAndInspect(<Surface elevation={3} position="absolute" />)
    expect(node.attributes.surfaceElevation).toBe(3)
  })

  it('elevation=0 omits the attribute', () => {
    const node = renderAndInspect(<Surface elevation={0} position="absolute" />)
    expect(node.attributes.surfaceElevation).toBeUndefined()
  })

  it('layout passthrough: padding / flex / border props reach ink-box style', () => {
    const node = renderAndInspect(
      <Surface
        position="absolute"
        padding={2}
        flexDirection="column"
        flexGrow={1}
        flexShrink={0}
        borderStyle="round"
        borderColor="#444"
      />,
    )
    expect(node.style.padding).toBe(2)
    expect(node.style.flexDirection).toBe('column')
    expect(node.style.flexGrow).toBe(1)
    expect(node.style.flexShrink).toBe(0)
    expect(node.style.borderStyle).toBe('round')
    expect(node.style.borderColor).toBe('#444')
  })
})

describe('Surface — backdrop sibling', () => {
  it('backdrop=true on an absolute Surface renders a sibling scrim with the right z', () => {
    // The scrim is rendered as a sibling Fragment child, NOT a child
    // of the Surface itself. To inspect both we need access to the
    // common parent — wrap the Surface in another ink-box and ref
    // THAT to read its childNodes.
    const parentRef = createRef<DOMElement>()
    const instance = renderSync(
      <ink-box ref={parentRef}>
        <Surface layer="modal" position="absolute" backdrop backdropColor="black" />
      </ink-box>,
      { stdout: fakeStdout(), patchConsole: false, exitOnCtrlC: false },
    )
    instances.push(instance)
    if (!parentRef.current) throw new Error('parent ref not populated')
    // Expect 2 children: scrim first, then the Surface itself.
    const parent = parentRef.current
    expect(parent.childNodes.length).toBe(2)
    const scrim = parent.childNodes[0] as DOMElement
    const surface = parent.childNodes[1] as DOMElement
    expect(scrim.nodeName).toBe('ink-box')
    expect(surface.nodeName).toBe('ink-box')
    // Scrim sits at modal_z - 1 = 2999, so it paints directly below
    // the modal but above every other band.
    expect(scrim.style.zIndex).toBe(2999)
    expect(surface.style.zIndex).toBe(3000)
    // Scrim is absolute + full-parent + black.
    expect(scrim.style.position).toBe('absolute')
    expect(scrim.style.width).toBe('100%')
    expect(scrim.style.height).toBe('100%')
    expect(scrim.style.backgroundColor).toBe('black')
  })

  it('backdrop on a non-absolute Surface produces NO scrim sibling (silently skipped)', () => {
    // Dev-warn already fires (tested separately); the render still
    // produces just the surface, not a stray absolute scrim that would
    // disrupt in-flow layout.
    const parentRef = createRef<DOMElement>()
    const instance = renderSync(
      <ink-box ref={parentRef}>
        <Surface backdrop position="relative" />
      </ink-box>,
      { stdout: fakeStdout(), patchConsole: false, exitOnCtrlC: false },
    )
    instances.push(instance)
    if (!parentRef.current) throw new Error('parent ref not populated')
    expect(parentRef.current.childNodes.length).toBe(1)
  })

  it("backdrop without explicit color uses 'black' default", () => {
    const parentRef = createRef<DOMElement>()
    const instance = renderSync(
      <ink-box ref={parentRef}>
        <Surface layer="modal" position="absolute" backdrop />
      </ink-box>,
      { stdout: fakeStdout(), patchConsole: false, exitOnCtrlC: false },
    )
    instances.push(instance)
    const scrim = parentRef.current!.childNodes[0] as DOMElement
    expect(scrim.style.backgroundColor).toBe('black')
  })
})

// ── 3. Dev warnings ──────────────────────────────────────────────────

describe('Surface — dev warnings for non-absolute misuse', () => {
  let originalDebug: string | undefined
  let stderrWrite: MockInstance<typeof process.stderr.write>

  beforeEach(() => {
    originalDebug = process.env.DEBUG
    Reflect.deleteProperty(process.env, 'DEBUG')
    disableDebugLogging()
    enableDebugLogging()
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

  function warnings(): string[] {
    return stderrWrite.mock.calls.map((c) => String(c[0]))
  }

  it('hitTestBoundary on a relative Surface logs a warning naming the prop', () => {
    renderAndInspect(<Surface hitTestBoundary position="relative" />)
    const warns = warnings()
    expect(warns.some((w) => w.includes('hitTestBoundary'))).toBe(true)
  })

  it('elevation > 0 on a relative Surface logs a warning naming the prop', () => {
    renderAndInspect(<Surface elevation={2} position="relative" />)
    const warns = warnings()
    expect(warns.some((w) => w.includes('elevation'))).toBe(true)
  })

  it('backdrop on a relative Surface logs a warning naming the prop', () => {
    renderAndInspect(<Surface backdrop position="relative" />)
    const warns = warnings()
    expect(warns.some((w) => w.includes('backdrop'))).toBe(true)
  })

  it('hitTestBoundary on an absolute Surface does NOT warn', () => {
    renderAndInspect(<Surface hitTestBoundary position="absolute" />)
    expect(warnings().every((w) => !w.includes('hitTestBoundary'))).toBe(true)
  })

  it('elevation on an absolute Surface does NOT warn', () => {
    renderAndInspect(<Surface elevation={2} position="absolute" />)
    expect(warnings().every((w) => !w.includes('elevation'))).toBe(true)
  })

  it('backdrop on an absolute Surface does NOT warn', () => {
    renderAndInspect(<Surface backdrop position="absolute" />)
    expect(warnings().every((w) => !w.includes('backdrop'))).toBe(true)
  })

  it('default Surface (no flags) produces no warnings', () => {
    renderAndInspect(<Surface />)
    // Layer is also not set, so no zIndex-without-absolute warning either.
    expect(warnings()).toEqual([])
  })
})
