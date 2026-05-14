import { createFocusTrap, getFocusableElements, type FocusTrap } from './focus-trap'
import { lockBodyScroll } from './scroll-lock'
import { injectModalStyles } from './styles'

/**
 * Options accepted by {@link attachModal}.
 */
export interface AttachModalOptions {
  /** Element that contains the dialog content (the `role="dialog"` div). */
  root: HTMLElement
  /**
   * Called when the user presses Escape. The consumer remains in
   * control of the "is open" state; this is purely a notification.
   */
  onRequestClose: () => void
  /**
   * Initial focus target. If omitted, focuses the first focusable
   * descendant of `root`. If `false`, no initial focus is moved — the
   * consumer is responsible for placing focus themselves.
   */
  initialFocus?: HTMLElement | false
  /**
   * If `true`, locks body scroll on attach and restores on detach.
   * Default `true`. Set `false` for popovers / non-modal overlays that
   * shouldn't block the page.
   */
  scrollLock?: boolean
  /**
   * If `true`, captures `document.activeElement` on attach and restores
   * focus to it on detach. Default `true`.
   */
  restoreFocus?: boolean
}

/** Handle returned by {@link attachModal}. */
export interface ModalHandle {
  /**
   * Detach all listeners, release the scroll lock, and (if
   * `restoreFocus` is true) move focus back to the element that had
   * it before the modal opened. Idempotent.
   */
  destroy(): void
}

/**
 * Wire up the full headless modal lifecycle for `options.root`:
 *
 * 1. Capture the currently-focused element (for later restoration).
 * 2. Lock body scroll.
 * 3. Move focus into the dialog — either the first focusable, or the
 *    explicit `initialFocus` target.
 * 4. Install a Tab/Shift+Tab focus trap.
 * 5. Install an Escape handler that calls `onRequestClose`.
 *
 * Call `handle.destroy()` when the consumer's "is open" state flips to
 * false. The consumer's own state machine owns the actual show/hide;
 * this primitive doesn't render anything itself.
 *
 * Framework-agnostic — no React or Vue imports. Pairs with
 * `getDialogAttributes` (`aria.ts`) for the ARIA bag.
 *
 * SSR-safe: returns a no-op handle when `document` is undefined.
 */
export function attachModal(options: AttachModalOptions): ModalHandle {
  if (typeof document === 'undefined') {
    return { destroy: () => undefined }
  }

  injectModalStyles()

  const { root, onRequestClose, initialFocus, scrollLock = true, restoreFocus = true } = options

  const previouslyFocused = restoreFocus ? (document.activeElement as HTMLElement | null) : null

  const releaseScrollLock = scrollLock ? lockBodyScroll() : () => undefined

  // Move initial focus into the dialog. `false` opts out entirely; an
  // explicit element wins over the default "first focusable" pick.
  if (initialFocus !== false) {
    const target =
      initialFocus instanceof HTMLElement ? initialFocus : getFocusableElements(root)[0]
    target?.focus()
  }

  const trap: FocusTrap = createFocusTrap({ root, onEscape: onRequestClose })

  let destroyed = false
  return {
    destroy(): void {
      if (destroyed) return
      destroyed = true
      trap.destroy()
      releaseScrollLock()
      // Restore focus last — earlier teardown may briefly land focus
      // on `document.body` while we remove the keydown listener; the
      // explicit `.focus()` here brings it back to the trigger.
      previouslyFocused?.focus?.()
    },
  }
}
