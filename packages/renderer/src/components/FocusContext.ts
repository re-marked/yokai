import { createContext } from 'react'
import type { DOMElement } from '../dom.js'
import type { FocusManager } from '../focus.js'

/**
 * Internal context that exposes the FocusManager + root node to React
 * land. App provides it; useFocus / useFocusManager / FocusGroup read
 * it. Null only during the initial render bootstrap before App mounts —
 * hooks treat null as "no focus subsystem available" and degrade to
 * no-ops rather than throwing, so a Resizable rendered outside of App
 * (e.g. in a unit test) doesn't blow up.
 */
export type FocusContextValue = {
  manager: FocusManager
  root: DOMElement
}

const FocusContext = createContext<FocusContextValue | null>(null)
FocusContext.displayName = 'InternalFocusContext'

export default FocusContext
