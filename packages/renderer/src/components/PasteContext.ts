import { createContext } from 'react'

/**
 * Internal context that lets `<AlternateScreen>` configure the
 * smart-paste threshold on the running App. App provides the setter
 * during render; AlternateScreen calls it on mount and on prop change.
 *
 * The threshold lives on the App instance (not React state) because
 * the smart-split happens in `handleParsedInput`, which runs outside
 * React's render flow against raw stdin bytes. A class-instance field
 * read at dispatch time is the right shape.
 *
 * `null` outside the App tree (consumer-rendered components in unit
 * tests bypassing App). AlternateScreen no-ops if the context is null.
 */
export type PasteContextValue = {
  setPasteThreshold: (threshold: number) => void
}

const PasteContext = createContext<PasteContextValue | null>(null)
PasteContext.displayName = 'InternalPasteContext'

export default PasteContext
