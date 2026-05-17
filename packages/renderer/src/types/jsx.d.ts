import type { ReactNode, Ref } from 'react'
import type { DOMElement } from '../dom'
import type { ClickEvent } from '../events/click-event'
import type { FocusEvent } from '../events/focus-event'
import type { KeyboardEvent } from '../events/keyboard-event'
import type { MouseDownEvent } from '../events/mouse-event'
import type { PasteEvent } from '../events/paste-event'
import type { Styles, TextStyles } from '../styles'

type InkBoxProps = {
  ref?: Ref<DOMElement>
  style?: Styles
  tabIndex?: number
  autoFocus?: boolean
  claimFocusOnClick?: boolean
  onClick?: (event: ClickEvent) => void
  onFocus?: (event: FocusEvent) => void
  onFocusCapture?: (event: FocusEvent) => void
  onBlur?: (event: FocusEvent) => void
  onBlurCapture?: (event: FocusEvent) => void
  onKeyDown?: (event: KeyboardEvent) => void
  onKeyDownCapture?: (event: KeyboardEvent) => void
  onMouseDown?: (event: MouseDownEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onPaste?: (event: PasteEvent) => void
  onPasteCapture?: (event: PasteEvent) => void
  stickyScroll?: boolean
  scrollBox?: boolean
  disableWheel?: boolean
  scrollWheelStep?: number
  // Surface-specific host attributes, set by `<Surface>` and read by
  // `hit-test.ts` (boundary occlusion) and `render-node-to-output.ts`
  // (shadow paint pass). Forward-looking — surfaceHitTestBoundary
  // codifies "this surface absorbs clicks at its cells" so a future
  // refactor of the implicit reverse-z hit-test can't silently break
  // modal semantics. See components/Surface/types.ts.
  surfaceHitTestBoundary?: boolean
  surfaceElevation?: number
  children?: ReactNode
}

type InkTextProps = {
  style?: Styles
  textStyles?: TextStyles
  children?: ReactNode
}

type InkLinkProps = {
  href: string
  children?: ReactNode
}

type InkRawAnsiProps = {
  rawText: string
  rawWidth: number
  rawHeight: number
}

type InkVirtualTextProps = {
  style?: Styles
  textStyles?: TextStyles
  children?: ReactNode
}

type InkRootProps = {
  children?: ReactNode
}

type InkProgressProps = {
  children?: ReactNode
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ink-box': InkBoxProps
      'ink-text': InkTextProps
      'ink-link': InkLinkProps
      'ink-raw-ansi': InkRawAnsiProps
      'ink-virtual-text': InkVirtualTextProps
      'ink-root': InkRootProps
      'ink-progress': InkProgressProps
    }
  }
}
