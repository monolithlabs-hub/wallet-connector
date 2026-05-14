import { describe, expect, it } from 'vitest'

import { getInstallBadge, getStatusBadge } from './badge'

describe('getInstallBadge', () => {
  it('returns "Get" on iOS when the badge should show', () => {
    expect(getInstallBadge({ shouldShow: true, isIOS: true })).toBe('Get')
  })

  it('returns "Install" on non-iOS (Android / desktop) when the badge should show', () => {
    expect(getInstallBadge({ shouldShow: true, isIOS: false })).toBe('Install')
  })

  it('returns null when shouldShow is false, regardless of platform', () => {
    expect(getInstallBadge({ shouldShow: false, isIOS: true })).toBeNull()
    expect(getInstallBadge({ shouldShow: false, isIOS: false })).toBeNull()
  })
})

describe('getStatusBadge', () => {
  it('returns null for a connected wallet (no badge over the active row)', () => {
    expect(getStatusBadge({ status: 'connected', isIOS: false })).toBeNull()
    expect(getStatusBadge({ status: 'connected', isIOS: true })).toBeNull()
  })

  it('returns "Detected" for an installed-but-inactive wallet', () => {
    expect(getStatusBadge({ status: 'available', isIOS: false })).toBe('Detected')
    expect(getStatusBadge({ status: 'available', isIOS: true })).toBe('Detected')
  })

  it('returns "Get" on iOS for an install-prompt wallet', () => {
    expect(getStatusBadge({ status: 'install', isIOS: true })).toBe('Get')
  })

  it('returns "Install" off-iOS for an install-prompt wallet', () => {
    expect(getStatusBadge({ status: 'install', isIOS: false })).toBe('Install')
  })
})
