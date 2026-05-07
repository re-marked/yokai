import { PassThrough } from 'node:stream'
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createNode } from '../dom.js'
import { type Instance, renderSync } from '../root.js'
import Box from './Box.js'
import ScrollBox, {
  clampScrollTop,
  computeClampedPendingDelta,
  type ScrollBoxHandle,
} from './ScrollBox.js'
import Text from './Text.js'

function scrollNode(
  opts: {
    scrollTop?: number
    pendingScrollDelta?: number
    scrollHeight?: number
    scrollViewportHeight?: number
  } = {},
) {
  const node = createNode('ink-box')
  node.scrollTop = opts.scrollTop
  node.pendingScrollDelta = opts.pendingScrollDelta
  node.scrollHeight = opts.scrollHeight
  node.scrollViewportHeight = opts.scrollViewportHeight
  return node
}

function fakeStdout(columns = 20, rows = 10): NodeJS.WriteStream {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream
  stdout.columns = columns
  stdout.rows = rows
  stdout.isTTY = false
  return stdout
}

describe('ScrollBox clamp helpers', () => {
  it('clamps scrollTo targets to the legal scroll range', () => {
    const node = scrollNode({ scrollHeight: 10, scrollViewportHeight: 3 })

    expect(clampScrollTop(node, -12)).toBe(0)
    expect(clampScrollTop(node, 4)).toBe(4)
    expect(clampScrollTop(node, 99)).toBe(7)
  })

  it('clamps scrollBy pending deltas against the final target', () => {
    const node = scrollNode({ scrollTop: 4, scrollHeight: 10, scrollViewportHeight: 3 })

    expect(computeClampedPendingDelta(node, 99)).toBe(3)
  })

  it('includes existing pending delta before clamping a new scrollBy', () => {
    const node = scrollNode({
      scrollTop: 2,
      pendingScrollDelta: 3,
      scrollHeight: 10,
      scrollViewportHeight: 3,
    })

    expect(computeClampedPendingDelta(node, 99)).toBe(5)
  })

  it('clears pending delta when the clamped target is the current position', () => {
    const node = scrollNode({ scrollTop: 7, scrollHeight: 10, scrollViewportHeight: 3 })

    expect(computeClampedPendingDelta(node, 1)).toBeUndefined()
  })
})

describe('ScrollBox rendering defaults', () => {
  const instances: Instance[] = []

  afterEach(() => {
    for (const instance of instances.splice(0)) {
      instance.unmount()
      instance.cleanup()
    }
  })

  it('stacks children vertically by default so content can exceed the viewport height', () => {
    const ref = createRef<ScrollBoxHandle>()
    const instance = renderSync(
      <Box width={8} height={2}>
        <ScrollBox ref={ref} width={8} height={2}>
          <Text>A</Text>
          <Text>B</Text>
          <Text>C</Text>
        </ScrollBox>
      </Box>,
      { stdout: fakeStdout(8, 4), patchConsole: false, exitOnCtrlC: false },
    )
    instances.push(instance)

    expect(ref.current?.getViewportHeight()).toBe(2)
    expect(ref.current?.getScrollHeight()).toBe(3)
  })
})
