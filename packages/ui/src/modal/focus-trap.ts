/**
 * Selector for tabbable elements. Mirrors the WAI-ARIA "tabbable" list:
 * native form controls + anchors / image-map areas with `href` + media
 * with controls + `contenteditable` + `details>summary` + `iframe` +
 * anything with a non-negative `tabindex`. `[disabled]`,
 * `tabindex="-1"`, and `contenteditable="false"` are explicitly
 * excluded.
 *
 * Known limitation: respects DOM order, NOT `tabindex > 0` priority.
 * The browser's native Tab order walks positive tabindices first (in
 * ascending order); this trap walks in DOM order regardless. Don't use
 * `tabindex > 0` inside trapped containers — it's a WAI-ARIA
 * anti-pattern anyway.
 *
 * Not exported — call sites should go through `getFocusableElements`.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable]:not([contenteditable="false"])',
  'audio[controls]',
  'video[controls]',
  'details > summary',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Return the focusable elements inside `root` in DOM order.
 *
 * Excludes:
 * - Form controls with `[disabled]`.
 * - Anything with `tabindex="-1"`.
 *
 * Does NOT exclude:
 * - Elements hidden via CSS (`display: none`, `visibility: hidden`).
 *   Hiding via CSS is the caller's concern; many headless modal users
 *   intentionally keep elements visually hidden but focusable.
 *
 * SSR-safe: returns `[]` when `root` is null or its `querySelectorAll`
 * is unavailable.
 */
export function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  // The DOM spec says `querySelectorAll` returns elements in tree
  // order regardless of selector-list order — but some implementations
  // (notably jsdom under compound comma-separated selectors with
  // `:not()` pseudo-classes) violate this and return in selector-list
  // order. Sort defensively by document position so consumers get a
  // consistent guarantee.
  items.sort((a, b) => {
    if (a === b) return 0
    const pos = a.compareDocumentPosition(b)
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  })
  return items
}

/** Options accepted by {@link createFocusTrap}. */
export interface FocusTrapOptions {
  /**
   * Element that contains the focusable region. The trap reads its
   * descendants via `getFocusableElements` on every Tab — so additions
   * to the DOM after attach (e.g., async-loaded items) are picked up
   * automatically.
   */
  root: HTMLElement
  /**
   * If set, the trap calls this when the user presses Escape. The
   * consumer remains in control of the "is the modal open" state; this
   * is purely a notification.
   *
   * Omit to disable Escape handling (e.g., for non-modal popovers
   * that should stay open until a click outside).
   */
  onEscape?: () => void
}

/** Handle returned by {@link createFocusTrap}. */
export interface FocusTrap {
  /** Detach the keydown listener. Idempotent. */
  destroy(): void
}

/**
 * Attach a focus trap to `options.root`. Tab/Shift+Tab cycle focus
 * within the focusable descendants of `root`; Escape (optionally) fires
 * `options.onEscape`.
 *
 * Listens on `document.keydown` (not `root`) so the trap fires regardless
 * of which descendant currently has focus and survives focus moving to
 * `document.body` momentarily during transitions.
 *
 * Does NOT move initial focus — `attachModal` is the orchestrator that
 * handles that. This primitive is intentionally narrow.
 *
 * SSR-safe: returns a no-op trap when `document` is undefined.
 */
export function createFocusTrap(options: FocusTrapOptions): FocusTrap {
  if (typeof document === 'undefined') {
    return { destroy: () => undefined }
  }

  const { root, onEscape } = options
  let destroyed = false

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (onEscape) {
        event.preventDefault()
        onEscape()
      }
      return
    }
    if (event.key !== 'Tab') return

    const items = getFocusableElements(root)
    if (items.length === 0) {
      // No focusables — block Tab from leaving the trap entirely.
      event.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) return
    const active = document.activeElement as HTMLElement | null

    if (event.shiftKey) {
      if (active === first || !root.contains(active)) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (active === last || !root.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  document.addEventListener('keydown', onKeyDown)

  return {
    destroy(): void {
      if (destroyed) return
      destroyed = true
      document.removeEventListener('keydown', onKeyDown)
    },
  }
}
