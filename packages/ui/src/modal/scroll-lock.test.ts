import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetScrollLockForTests, lockBodyScroll } from './scroll-lock'

beforeEach(() => {
  __resetScrollLockForTests()
})

afterEach(() => {
  __resetScrollLockForTests()
})

describe('lockBodyScroll', () => {
  it('sets body overflow to hidden on lock and restores on release', () => {
    expect(document.body.style.overflow).toBe('')

    const release = lockBodyScroll()
    expect(document.body.style.overflow).toBe('hidden')

    release()
    expect(document.body.style.overflow).toBe('')
  })

  it('preserves the original overflow value across the lock cycle', () => {
    document.body.style.overflow = 'auto'

    const release = lockBodyScroll()
    expect(document.body.style.overflow).toBe('hidden')

    release()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('refcount keeps the lock active until the LAST release fires', () => {
    const r1 = lockBodyScroll()
    const r2 = lockBodyScroll()
    expect(document.body.style.overflow).toBe('hidden')

    r1()
    // Second lock still active.
    expect(document.body.style.overflow).toBe('hidden')

    r2()
    expect(document.body.style.overflow).toBe('')
  })

  it('returns a no-op release when `document` is undefined (SSR)', () => {
    vi.stubGlobal('document', undefined)
    try {
      const release = lockBodyScroll()
      expect(() => release()).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('release functions are idempotent — calling twice does not double-decrement', () => {
    const r1 = lockBodyScroll()
    const r2 = lockBodyScroll()

    r1()
    r1() // no-op second call
    r1() // no-op third call

    // The refcount should still be at 1 (r2 holds the lock), so body
    // overflow is still hidden. If `r1()`s extras had decremented, the
    // count would have hit zero and the lock would have released.
    expect(document.body.style.overflow).toBe('hidden')

    r2()
    expect(document.body.style.overflow).toBe('')
  })
})
