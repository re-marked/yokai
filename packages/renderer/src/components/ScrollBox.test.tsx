import { PassThrough } from 'node:stream'
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createNode } from '../dom.js'
import { type Instance, renderSync } from '../root.js'
import Box from './Box.js'
import ScrollBox, {
  computePendingScrollDelta,
  normalizeScrollTarget,
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
  it('normalizes negative and non-finite scrollTo targets', () => {
    expect(normalizeScrollTarget(-12)).toBe(0)
    expect(normalizeScrollTarget(Number.NaN)).toBe(0)
    expect(normalizeScrollTarget(4.8)).toBe(4)
  })

  it('preserves requested scrollTo targets above cached layout bounds', () => {
    expect(normalizeScrollTarget(99)).toBe(99)
  })

  it('preserves requested scrollBy deltas above cached layout bounds', () => {
    const node = scrollNode({ scrollTop: 4, scrollHeight: 10, scrollViewportHeight: 3 })

    expect(computePendingScrollDelta(node, 99)).toBe(99)
  })

  it('includes existing pending delta before computing a new scrollBy target', () => {
    const node = scrollNode({
      scrollTop: 2,
      pendingScrollDelta: 3,
      scrollHeight: 10,
      scrollViewportHeight: 3,
    })

    expect(computePendingScrollDelta(node, 99)).toBe(102)
  })

  it('clears pending delta when the normalized target is the current position', () => {
    const node = scrollNode({ scrollTop: 0 })

    expect(computePendingScrollDelta(node, -1)).toBeUndefined()
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
