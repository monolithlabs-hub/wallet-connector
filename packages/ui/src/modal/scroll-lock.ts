/**
 * Refcounted body scroll lock. Multiple `lockBodyScroll()` calls
 * accumulate; the original `document.body.style.overflow` is restored
 * only when the LAST release fires. Lets nested modals (or sibling
 * popovers that both lock scroll) compose without stepping on each
 * other.
 *
 * The original `overflow` value is captured on the first lock and held
 * across the whole lock lifecycle — so a consumer that mutates
 * `body.style.overflow` while a lock is active won't have their value
 * restored when the lock releases. Don't do that.
 *
 * **iOS Safari caveat.** Setting `overflow: hidden` on `body` does NOT
 * prevent touch-scroll on iOS Safari — the page still scrolls under
 * the modal. This is a known WebKit limitation that requires the
 * `position: fixed` + scroll-position-restore dance (the
 * `body-scroll-lock` library implements it correctly). For the
 * wallet-connect deep-link flow the iOS modal lifetime is short (the
 * user navigates to their wallet app and back), so this lock is
 * adequate for the library's primary use case. Production apps that
 * keep a modal visible on iOS for an extended period should layer a
 * dedicated scroll-lock library on top.
 */

let lockCount = 0
let originalOverflow: string | null = null

/**
 * Lock body scroll. Returns a function to release THIS lock — call
 * exactly once. Subsequent calls to the returned release function are
 * no-ops.
 *
 * SSR-safe: returns a no-op release when `document` is undefined.
 */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined' || !document.body) {
    return () => undefined
  }

  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount += 1

  let released = false
  return (): void => {
    if (released) return
    released = true
    lockCount -= 1
    if (lockCount === 0 && originalOverflow !== null) {
      document.body.style.overflow = originalOverflow
      originalOverflow = null
    }
  }
}

/**
 * Test helper — resets the module's internal counter and any cached
 * original overflow. Tests can call this in `beforeEach` to ensure no
 * state bleeds between cases. Not part of the public package API; not
 * re-exported from the package root.
 */
export function __resetScrollLockForTests(): void {
  lockCount = 0
  originalOverflow = null
  if (typeof document !== 'undefined' && document.body) {
    document.body.style.overflow = ''
  }
}
