import { describe, expect, it } from 'vitest'

import { WalletReadyState } from './ready-state'

describe('WalletReadyState', () => {
  it('has the four expected variants', () => {
    expect(WalletReadyState.Installed).toBe('Installed')
    expect(WalletReadyState.NotDetected).toBe('NotDetected')
    expect(WalletReadyState.Loadable).toBe('Loadable')
    expect(WalletReadyState.Unsupported).toBe('Unsupported')
  })

  it('serializes round-trip through JSON', () => {
    const value: WalletReadyState = WalletReadyState.Installed
    expect(JSON.parse(JSON.stringify(value))).toBe(WalletReadyState.Installed)
  })
})
