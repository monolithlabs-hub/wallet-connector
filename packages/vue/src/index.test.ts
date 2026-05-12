import { describe, it, expect } from 'vitest'

describe('@opindex/wallet-connect-vue test setup', () => {
  it('runs a trivial assertion', () => {
    expect(true).toBe(true)
  })

  it('runs in a jsdom environment', () => {
    expect(typeof window).toBe('object')
    expect(typeof document).toBe('object')
  })
})
