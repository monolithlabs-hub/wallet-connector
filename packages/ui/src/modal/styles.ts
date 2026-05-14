/**
 * Theming surface for the headless modal primitives.
 *
 * `attachModal` consumers (e.g., React `<ConnectButton>`, Vue
 * `<ConnectButton>`) read these CSS custom properties via inline
 * `style={{ background: 'var(--wc-bg, #fff)' }}` calls — the second
 * argument to `var()` is the fallback, so consumers who set nothing get
 * the current default look. To theme, set the variables on
 * `[role="dialog"]`, on `[data-wc-modal]`, on a parent element, or on
 * `:root`.
 *
 * A small block of CSS that **cannot** be expressed inline (hover,
 * focus-visible, disabled states) is injected once into `<head>` on the
 * first {@link attachModal} call — see {@link injectModalStyles}.
 *
 * SSR-safe: the injection is a no-op when `document` is undefined.
 */

/**
 * Catalog of the modal's CSS custom properties and their default values.
 * Surfaced for documentation / TS autocomplete; the defaults are also
 * embedded in the injected stylesheet so consumers don't HAVE to know
 * the names (the components read them via inline `var(--wc-foo, fallback)`).
 */
export const MODAL_CSS_VARS = {
  '--wc-bg': '#fff',
  '--wc-fg': '#111',
  '--wc-accent': '#5b5bd6',
  '--wc-muted-fg': 'rgba(0, 0, 0, 0.6)',
  '--wc-border': 'rgba(0, 0, 0, 0.08)',
  '--wc-radius': '12px',
  '--wc-radius-item': '8px',
  '--wc-backdrop': 'rgba(0, 0, 0, 0.5)',
  '--wc-shadow': '0 20px 40px rgba(0, 0, 0, 0.3)',
  '--wc-badge-bg': 'rgba(0, 0, 0, 0.08)',
  '--wc-badge-fg': 'inherit',
  '--wc-detected-bg': 'rgba(34, 197, 94, 0.12)',
  '--wc-detected-fg': 'rgb(21, 128, 61)',
  '--wc-item-hover-bg': 'rgba(0, 0, 0, 0.04)',
  '--wc-error-bg': 'rgba(220, 38, 38, 0.08)',
  '--wc-error-fg': 'rgb(185, 28, 28)',
  '--wc-font-size': '14px',
  '--wc-title-size': '18px',
} as const

export type ModalCssVar = keyof typeof MODAL_CSS_VARS

/**
 * CSS injected into `<head>` on the first {@link injectModalStyles} call.
 *
 * Only contains rules that **cannot** be expressed via inline `style`
 * (hover, focus-visible, disabled). The variable DEFAULTS are NOT
 * declared on `[data-wc-modal]` — that would shadow consumer
 * `:root { --wc-bg: …; }` overrides because the local declaration
 * outranks the inherited one. Instead, every consumer-facing `style`
 * attribute reads the variable with an inline fallback:
 * `style={{ background: 'var(--wc-bg, #fff)' }}`. That keeps the
 * cascade working — overrides anywhere up the tree (or on the dialog
 * itself) propagate through.
 *
 * `var()` calls below use the same fallback pattern so an undeclared
 * variable resolves to the documented default.
 */
const MODAL_STYLESHEET = `
[data-wc-wallet-item] {
  transition: background-color 120ms ease;
}
[data-wc-wallet-item]:hover:not(:disabled) {
  background-color: var(--wc-item-hover-bg, rgba(0, 0, 0, 0.04));
}
[data-wc-wallet-item]:focus-visible {
  outline: 2px solid var(--wc-accent, #5b5bd6);
  outline-offset: 2px;
}
[data-wc-wallet-item]:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
[data-wc-modal-close]:hover:not(:disabled) {
  background-color: var(--wc-item-hover-bg, rgba(0, 0, 0, 0.04));
}
[data-wc-modal-close]:focus-visible {
  outline: 2px solid var(--wc-accent, #5b5bd6);
  outline-offset: 2px;
}
`

const STYLE_ATTR = 'data-wc-styles'

let injected = false

/**
 * Inject the modal stylesheet into `<head>` exactly once per document.
 * Idempotent: subsequent calls are no-ops once the `<style data-wc-styles>`
 * element is present.
 *
 * SSR no-op: returns silently when `document` is undefined.
 *
 * Called automatically by {@link attachModal}; exposed publicly so
 * consumers who roll their own attach can pre-inject (e.g., for SSR
 * hydration where the styles should be present before the first paint).
 */
export function injectModalStyles(): void {
  if (typeof document === 'undefined') return
  if (injected) return
  // Double-check via attribute — handles multiple module instances loaded
  // into the same page (e.g., in a micro-frontend setup with bundling
  // quirks where the module-level `injected` flag isn't shared).
  if (document.querySelector(`style[${STYLE_ATTR}]`)) {
    injected = true
    return
  }
  const style = document.createElement('style')
  style.setAttribute(STYLE_ATTR, '')
  style.textContent = MODAL_STYLESHEET
  document.head.appendChild(style)
  injected = true
}

/** Test-only helper: reset the module-level "injected" flag so successive tests can re-inject. */
export function __resetModalStylesForTests(): void {
  injected = false
  if (typeof document === 'undefined') return
  const existing = document.head.querySelector(`style[${STYLE_ATTR}]`)
  existing?.remove()
}
