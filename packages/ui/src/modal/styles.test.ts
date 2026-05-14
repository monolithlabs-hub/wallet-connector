import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetModalStylesForTests, injectModalStyles, MODAL_CSS_VARS } from './styles'

beforeEach(() => {
  __resetModalStylesForTests()
})

afterEach(() => {
  __resetModalStylesForTests()
})

describe('injectModalStyles', () => {
  it('appends a single <style data-wc-styles> to <head> on first call', () => {
    injectModalStyles()

    const styles = document.head.querySelectorAll('style[data-wc-styles]')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.textContent ?? '').toContain('data-wc-wallet-item')
  })

  it('is idempotent — repeated calls do not duplicate the stylesheet', () => {
    injectModalStyles()
    injectModalStyles()
    injectModalStyles()

    expect(document.head.querySelectorAll('style[data-wc-styles]')).toHaveLength(1)
  })

  it('does not declare variable defaults on [data-wc-modal] (would shadow consumer overrides)', () => {
    // Defaults are inlined via `var(--wc-*, fallback)` in each
    // component's `style` attribute. Declaring them ON the dialog would
    // outrank any `:root { --wc-bg: … }` override the consumer sets.
    injectModalStyles()
    const text = document.head.querySelector('style[data-wc-styles]')?.textContent ?? ''

    expect(text).not.toMatch(/\[data-wc-modal\]\s*\{/)
  })

  it('emits hover and focus-visible rules for wallet items', () => {
    injectModalStyles()
    const text = document.head.querySelector('style[data-wc-styles]')?.textContent ?? ''

    expect(text).toContain('[data-wc-wallet-item]:hover')
    expect(text).toContain('[data-wc-wallet-item]:focus-visible')
    expect(text).toContain('[data-wc-modal-close]:hover')
  })

  it('no-ops when document is undefined (SSR)', () => {
    vi.stubGlobal('document', undefined)
    try {
      expect(() => injectModalStyles()).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('skips re-injecting when a pre-existing <style data-wc-styles> is in the DOM', () => {
    // Simulate a separate module instance that already injected the styles
    // (e.g., micro-frontend setup where the module-level `injected` flag
    // isn't shared between bundles).
    const preExisting = document.createElement('style')
    preExisting.setAttribute('data-wc-styles', '')
    preExisting.textContent = '/* external */'
    document.head.appendChild(preExisting)

    injectModalStyles()

    const styles = document.head.querySelectorAll('style[data-wc-styles]')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.textContent).toBe('/* external */')
  })
})

describe('MODAL_CSS_VARS', () => {
  it('exposes every documented variable with a non-empty default', () => {
    for (const [name, value] of Object.entries(MODAL_CSS_VARS)) {
      expect(name.startsWith('--wc-')).toBe(true)
      expect(value).toBeTruthy()
    }
  })
})
