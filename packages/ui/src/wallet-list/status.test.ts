import { describe, expect, it } from 'vitest'

import { getWalletStatus } from './status'

describe('getWalletStatus', () => {
  it('returns "connected" when isConnected is true', () => {
    expect(getWalletStatus({ isConnected: true, isDetected: true })).toBe('connected')
    expect(getWalletStatus({ isConnected: true, isDetected: false })).toBe('connected')
  })

  it('returns "available" when not connected but detected', () => {
    expect(getWalletStatus({ isConnected: false, isDetected: true })).toBe('available')
  })

  it('returns "install" when not connected and not detected', () => {
    expect(getWalletStatus({ isConnected: false, isDetected: false })).toBe('install')
  })

  it('treats `connected` as winning over `available` when both are true', () => {
    // Documents the precedence rule baked into the helper — connected
    // is more specific than detected, so it takes priority.
    expect(getWalletStatus({ isConnected: true, isDetected: true })).toBe('connected')
  })
})
