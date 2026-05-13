import { describe, expect, it } from 'vitest'

import { getInstallBadge } from './badge'

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
