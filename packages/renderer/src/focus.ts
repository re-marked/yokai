import type { DOMElement } from './dom'
import { FocusEvent } from './events/focus-event'

const MAX_FOCUS_STACK = 32

/**
 * DOM-like focus manager for the Ink terminal UI.
 *
 * Pure state — tracks activeElement and a focus stack. Has no reference
 * to the tree; callers pass the root when tree walks are needed.
 *
 * Stored on the root DOMElement so any node can reach it by walking
 * parentNode (like browser's `node.ownerDocument`).
 */
export class FocusManager {
  activeElement: DOMElement | null = null
  private dispatchFocusEvent: (target: DOMElement, event: FocusEvent) => boolean
  private enabled = true
  private focusStack: DOMElement[] = []
  // Per-node focus listeners. Keyed by the DOM node so subscribers only
  // fire when THIS node's focus state changes (vs a global listener that
  // fires on every focus change and forces every subscriber to re-check).
  // Set-of-listeners-per-node is cheap to add/remove and scales linearly
  // with the number of useFocus subscribers, which is bounded by the
  // number of focusable elements in the tree.
  private nodeListeners = new Map<DOMElement, Set<(focused: boolean) => void>>()
  // Global focus-change listeners (no node filter). Useful for components
  // that need to know about ANY focus change — useFocusManager exposes a
  // `focused` value through this so consumers can render based on which
  // element is currently active without subscribing to each one.
  private globalListeners = new Set<() => void>()

  constructor(dispatchFocusEvent: (target: DOMElement, event: FocusEvent) => boolean) {
    this.dispatchFocusEvent = dispatchFocusEvent
  }

  /**
   * Subscribe to focus/blur of a SPECIFIC node. Listener fires with
   * `true` when the node gains focus, `false` when it loses focus.
   * Returns an unsubscribe function. Safe to call before the node is
   * focused — listener simply waits.
   *
   * Used by useFocus(). Targeted (per-node) rather than global so each
   * useFocus consumer only re-renders when its own element transitions,
   * not on every focus change anywhere in the tree.
   */
  subscribeToFocus(node: DOMElement, listener: (focused: boolean) => void): () => void {
    let set = this.nodeListeners.get(node)
    if (!set) {
      set = new Set()
      this.nodeListeners.set(node, set)
    }
    set.add(listener)
    return () => {
      const s = this.nodeListeners.get(node)
      if (!s) return
      s.delete(listener)
      if (s.size === 0) this.nodeListeners.delete(node)
    }
  }

  /**
   * Subscribe to ANY focus change. Listener fires after every focus()
   * or blur() call. Returns an unsubscribe function. Used by
   * useFocusManager() so its returned `focused` value stays current.
   */
  subscribe(listener: () => void): () => void {
    this.globalListeners.add(listener)
    return () => {
      this.globalListeners.delete(listener)
    }
  }

  private notifyNode(node: DOMElement, focused: boolean): void {
    const set = this.nodeListeners.get(node)
    if (!set) return
    // Iterate a snapshot so a listener that unsubscribes during dispatch
    // doesn't perturb the iteration. Set's iterator handles deletes mid-
    // iteration in modern JS, but copying once is cheap and unambiguous.
    for (const l of [...set]) l(focused)
  }

  private notifyGlobal(): void {
    for (const l of [...this.globalListeners]) l()
  }

  focus(node: DOMElement): void {
    if (node === this.activeElement) return
    if (!this.enabled) return

    const previous = this.activeElement
    if (previous) {
      // Deduplicate before pushing to prevent unbounded growth from Tab cycling
      const idx = this.focusStack.indexOf(previous)
      if (idx !== -1) this.focusStack.splice(idx, 1)
      this.focusStack.push(previous)
      if (this.focusStack.length > MAX_FOCUS_STACK) this.focusStack.shift()
      this.dispatchFocusEvent(previous, new FocusEvent('blur', node))
    }
    this.activeElement = node
    this.dispatchFocusEvent(node, new FocusEvent('focus', previous))
    // Notify hook subscribers AFTER state + DOM events have settled —
    // mirrors browser ordering where the focus event handler sees
    // document.activeElement === the new element.
    if (previous) this.notifyNode(previous, false)
    this.notifyNode(node, true)
    this.notifyGlobal()
  }

  blur(): void {
    if (!this.activeElement) return

    const previous = this.activeElement
    this.activeElement = null
    this.dispatchFocusEvent(previous, new FocusEvent('blur', null))
    this.notifyNode(previous, false)
    this.notifyGlobal()
  }

  /**
   * Called by the reconciler when a node is removed from the tree.
   * Handles both the exact node and any focused descendant within
   * the removed subtree. Dispatches blur and restores focus from stack.
   */
  handleNodeRemoved(node: DOMElement, root: DOMElement): void {
    // Remove the node and any descendants from the stack
    this.focusStack = this.focusStack.filter((n) => n !== node && isInTree(n, root))

    // Check if activeElement is the removed node OR a descendant
    if (!this.activeElement) return
    if (this.activeElement !== node && isInTree(this.activeElement, root)) {
      return
    }

    const removed = this.activeElement
    this.activeElement = null
    this.dispatchFocusEvent(removed, new FocusEvent('blur', null))
    this.notifyNode(removed, false)
    // Drop listeners for the unmounted node — the React component owning
    // them is gone, but a stale listener referencing a freed yoga subtree
    // would prevent garbage collection.
    this.nodeListeners.delete(removed)

    // Restore focus to the most recent still-mounted element
    while (this.focusStack.length > 0) {
      const candidate = this.focusStack.pop()!
      if (isInTree(candidate, root)) {
        this.activeElement = candidate
        this.dispatchFocusEvent(candidate, new FocusEvent('focus', removed))
        this.notifyNode(candidate, true)
        this.notifyGlobal()
        return
      }
    }
    // No candidate restored — fire global so subscribers see "no focus."
    this.notifyGlobal()
  }

  handleAutoFocus(node: DOMElement): void {
    this.focus(node)
  }

  handleClickFocus(node: DOMElement): void {
    const tabIndex = node.attributes.tabIndex
    if (typeof tabIndex !== 'number') return
    this.focus(node)
  }

  enable(): void {
    this.enabled = true
  }

  disable(): void {
    this.enabled = false
  }

  focusNext(root: DOMElement): void {
    this.moveFocus(1, root)
  }

  focusPrevious(root: DOMElement): void {
    this.moveFocus(-1, root)
  }

  private moveFocus(direction: 1 | -1, root: DOMElement): void {
    if (!this.enabled) return

    const tabbable = collectTabbable(root)
    if (tabbable.length === 0) return

    const currentIndex = this.activeElement ? tabbable.indexOf(this.activeElement) : -1

    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : tabbable.length - 1
        : (currentIndex + direction + tabbable.length) % tabbable.length

    const next = tabbable[nextIndex]
    if (next) {
      this.focus(next)
    }
  }
}

function collectTabbable(root: DOMElement): DOMElement[] {
  const result: DOMElement[] = []
  walkTree(root, result)
  return result
}

function walkTree(node: DOMElement, result: DOMElement[]): void {
  const tabIndex = node.attributes.tabIndex
  if (typeof tabIndex === 'number' && tabIndex >= 0) {
    result.push(node)
  }

  for (const child of node.childNodes) {
    if (child.nodeName !== '#text') {
      walkTree(child, result)
    }
  }
}

function isInTree(node: DOMElement, root: DOMElement): boolean {
  let current: DOMElement | undefined = node
  while (current) {
    if (current === root) return true
    current = current.parentNode
  }
  return false
}

/**
 * Walk up to root and return it. The root is the node that holds
 * the FocusManager — like browser's `node.getRootNode()`.
 */
export function getRootNode(node: DOMElement): DOMElement {
  let current: DOMElement | undefined = node
  while (current) {
    if (current.focusManager) return current
    current = current.parentNode
  }
  throw new Error('Node is not in a tree with a FocusManager')
}

/**
 * Walk up to root and return its FocusManager.
 * Like browser's `node.ownerDocument` — focus belongs to the root.
 */
export function getFocusManager(node: DOMElement): FocusManager {
  return getRootNode(node).focusManager!
}
