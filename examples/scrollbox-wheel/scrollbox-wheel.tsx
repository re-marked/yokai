/**
 * ScrollBox wheel demo.
 *
 *   pnpm demo:scrollbox-wheel
 *
 * Move the mouse over each panel and use the wheel:
 * - left panel scrolls with the default step
 * - right panel scrolls faster via wheelStep={6}
 * - nested panel handles wheel before its parent
 * - disabled nested panel falls through to the outer ScrollBox
 *
 * Press q, Escape, or Ctrl+C to quit.
 */

import {
  AlternateScreen,
  Box,
  ScrollBox,
  type ScrollBoxHandle,
  Text,
  render,
  useApp,
  useInput,
} from '@yokai-tui/renderer'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

function useScrollTop(ref: React.RefObject<ScrollBoxHandle | null>): number {
  const [top, setTop] = useState(0)

  useEffect(() => {
    const box = ref.current
    if (!box) return

    setTop(box.getScrollTop())
    return box.subscribe(() => setTop(box.getScrollTop() + box.getPendingDelta()))
  }, [ref])

  return top
}

function Row({ index, tone }: { index: number; tone: 'cyan' | 'green' | 'yellow' }): React.ReactNode {
  return (
    <Box>
      <Text color={tone}>{String(index).padStart(2, '0')}</Text>
      <Text dim>  The quick brown yokai scrolls over the lazy terminal.</Text>
    </Box>
  )
}

function PlainRows({
  count,
  keyPrefix,
  tone,
}: {
  count: number
  keyPrefix: string
  tone: 'cyan' | 'green' | 'yellow'
}): React.ReactNode {
  return Array.from({ length: count }, (_, i) => (
    <Row key={`${keyPrefix}-${i}`} index={i + 1} tone={tone} />
  ))
}

function Panel({
  title,
  hint,
  top,
  children,
}: {
  title: string
  hint: string
  top: number
  children: React.ReactNode
}): React.ReactNode {
  return (
    <Box flexDirection="column" width={48} height={18} borderStyle="single" borderColor="gray">
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold>{title}</Text>
        <Text dim>scrollTop {top}</Text>
      </Box>
      <Box paddingX={1}>
        <Text dim>{hint}</Text>
      </Box>
      {children}
    </Box>
  )
}

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
  })

  const defaultRef = useRef<ScrollBoxHandle>(null)
  const fastRef = useRef<ScrollBoxHandle>(null)
  const outerRef = useRef<ScrollBoxHandle>(null)
  const innerRef = useRef<ScrollBoxHandle>(null)
  const disabledOuterRef = useRef<ScrollBoxHandle>(null)

  const defaultTop = useScrollTop(defaultRef)
  const fastTop = useScrollTop(fastRef)
  const outerTop = useScrollTop(outerRef)
  const innerTop = useScrollTop(innerRef)
  const disabledOuterTop = useScrollTop(disabledOuterRef)

  const rows = useMemo(() => PlainRows({ count: 40, keyPrefix: 'default', tone: 'cyan' }), [])
  const fastRows = useMemo(() => PlainRows({ count: 40, keyPrefix: 'fast', tone: 'green' }), [])

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" width="100%" height="100%" padding={1}>
        <Text bold>yokai ScrollBox wheel demo</Text>
        <Text dim>
          Hover a panel and use the mouse wheel. q / Escape exits. Existing useInput wheel events
          still fire; ScrollBox just owns the default scroll behavior now.
        </Text>

        <Box flexDirection="row" gap={2} marginTop={1}>
          <Panel title="default wheel" hint="wheelStep defaults to 3 rows" top={defaultTop}>
            <ScrollBox ref={defaultRef} height={14} paddingX={1}>
              {rows}
            </ScrollBox>
          </Panel>

          <Panel title="fast wheel" hint="wheelStep={6}" top={fastTop}>
            <ScrollBox ref={fastRef} height={14} paddingX={1} wheelStep={6}>
              {fastRows}
            </ScrollBox>
          </Panel>
        </Box>

        <Box flexDirection="row" gap={2} marginTop={1}>
          <Panel title="nested wins" hint={`outer ${outerTop} / inner ${innerTop}`} top={outerTop}>
            <ScrollBox ref={outerRef} height={14} paddingX={1}>
              <Text dim>Outer content above the nested ScrollBox.</Text>
              {PlainRows({ count: 6, keyPrefix: 'nested-outer-before', tone: 'cyan' })}
              <Box borderStyle="round" borderColor="green" marginY={1} paddingX={1}>
                <ScrollBox ref={innerRef} height={6} wheelStep={1}>
                  {PlainRows({ count: 20, keyPrefix: 'nested-inner', tone: 'green' })}
                </ScrollBox>
              </Box>
              <Text dim>Outer content below the nested ScrollBox.</Text>
              {PlainRows({ count: 18, keyPrefix: 'nested-outer-after', tone: 'cyan' })}
            </ScrollBox>
          </Panel>

          <Panel
            title="disabled inner"
            hint="wheel over the yellow box; parent scrolls"
            top={disabledOuterTop}
          >
            <ScrollBox ref={disabledOuterRef} height={14} paddingX={1}>
              <Text dim>This inner ScrollBox has disableWheel.</Text>
              {PlainRows({ count: 6, keyPrefix: 'disabled-outer-before', tone: 'cyan' })}
              <Box borderStyle="round" borderColor="yellow" marginY={1} paddingX={1}>
                <ScrollBox height={6} disableWheel>
                  {PlainRows({ count: 20, keyPrefix: 'disabled-inner', tone: 'yellow' })}
                </ScrollBox>
              </Box>
              <Text dim>Because inner opts out, wheel falls through upward.</Text>
              {PlainRows({ count: 18, keyPrefix: 'disabled-outer-after', tone: 'cyan' })}
            </ScrollBox>
          </Panel>
        </Box>
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
