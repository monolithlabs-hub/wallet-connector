import { describe, it, expect } from 'vitest'

describe('@monolithlabs/wallet-connect-core test setup', () => {
  it('runs a trivial assertion', () => {
    expect(true).toBe(true)
  })

  it('runs in a jsdom environment with the browser APIs core relies on', () => {
    expect(typeof window).toBe('object')
    expect(typeof window.localStorage).toBe('object')
    expect(typeof window.sessionStorage).toBe('object')
    expect(typeof navigator.userAgent).toBe('string')
  })
})
