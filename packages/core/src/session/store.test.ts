import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  type PendingState,
  clearPendingState,
  createPendingState,
  getLastUsedWallet,
  getPendingState,
  saveLastUsedWallet,
  savePendingState,
} from './store'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('SessionStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
    localStorage.clear()
    clearPendingState()
  })

  it('saves and retrieves pending state', () => {
    const state = createPendingState({ walletId: 'phantom', requireSignIn: true })
    savePendingState(state)

    expect(getPendingState()).toEqual(state)
  })

  it('returns null when no pending state exists', () => {
    expect(getPendingState()).toBeNull()
  })

  it('returns null for state older than 10 minutes', () => {
    const stale: PendingState = {
      walletId: 'phantom',
      requireSignIn: false,
      nonce: '00000000-0000-4000-8000-000000000000',
      timestamp: Date.now() - 10 * 60 * 1000 - 1,
    }
    savePendingState(stale)

    expect(getPendingState()).toBeNull()
  })

  it('clears stale state as a side effect of getPendingState', () => {
    const stale: PendingState = {
      walletId: 'phantom',
      requireSignIn: false,
      nonce: '00000000-0000-4000-8000-000000000000',
      timestamp: Date.now() - 20 * 60 * 1000,
    }
    savePendingState(stale)

    getPendingState()

    expect(sessionStorage.getItem('@monolithlabs/wc:pendingState')).toBeNull()
  })

  it('clearPendingState removes state', () => {
    savePendingState(createPendingState({ walletId: 'phantom', requireSignIn: false }))
    clearPendingState()

    expect(getPendingState()).toBeNull()
  })

  it('saves and retrieves lastUsedWallet', () => {
    saveLastUsedWallet('phantom')

    expect(getLastUsedWallet()).toBe('phantom')
  })

  it('getLastUsedWallet returns null when none has been set', () => {
    expect(getLastUsedWallet()).toBeNull()
  })

  it('does not throw when sessionStorage is unavailable', () => {
    vi.stubGlobal('sessionStorage', undefined)
    const state = createPendingState({ walletId: 'phantom', requireSignIn: false })

    expect(() => savePendingState(state)).not.toThrow()
    expect(() => getPendingState()).not.toThrow()
    expect(() => clearPendingState()).not.toThrow()
  })

  it('does not throw when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)

    expect(() => saveLastUsedWallet('phantom')).not.toThrow()
    expect(() => getLastUsedWallet()).not.toThrow()
  })

  it('falls back to in-memory store when sessionStorage is unavailable', () => {
    vi.stubGlobal('sessionStorage', undefined)
    const state = createPendingState({ walletId: 'phantom', requireSignIn: true })

    savePendingState(state)

    expect(getPendingState()).toEqual(state)
  })

  it('falls back to in-memory store when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    saveLastUsedWallet('solflare')

    expect(getLastUsedWallet()).toBe('solflare')
  })

  it('createPendingState generates a UUID v4 nonce', () => {
    const state = createPendingState({ walletId: 'phantom', requireSignIn: false })

    expect(state.nonce).toMatch(UUID_V4)
  })

  it('createPendingState produces a unique nonce per call', () => {
    const a = createPendingState({ walletId: 'phantom', requireSignIn: false })
    const b = createPendingState({ walletId: 'phantom', requireSignIn: false })

    expect(a.nonce).not.toBe(b.nonce)
  })

  it('createPendingState includes signInMessage when provided', () => {
    const state = createPendingState({
      walletId: 'phantom',
      requireSignIn: true,
      signInMessage: 'Sign in to Opindex',
    })

    expect(state.signInMessage).toBe('Sign in to Opindex')
  })

  it('returns null on corrupt JSON in sessionStorage', () => {
    sessionStorage.setItem('@monolithlabs/wc:pendingState', '{ not json')

    expect(getPendingState()).toBeNull()
  })
})
