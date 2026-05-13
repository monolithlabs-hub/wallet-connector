import { describe, expect, it } from 'vitest'

import { getDialogAttributes } from './aria'

describe('getDialogAttributes', () => {
  it('returns the standard ARIA bag for a modal dialog', () => {
    expect(getDialogAttributes('my-title')).toEqual({
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'my-title',
    })
  })

  it('passes the titleId through verbatim', () => {
    const attrs = getDialogAttributes(':r1:')
    expect(attrs['aria-labelledby']).toBe(':r1:')
  })
})
