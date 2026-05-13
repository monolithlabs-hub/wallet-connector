import { describe, expect, it } from 'vitest'

import { truncatePublicKey } from './truncate'

describe('truncatePublicKey', () => {
  it('truncates a long string with 4+4 chars and a Unicode ellipsis by default', () => {
    expect(truncatePublicKey('ABCD1234567890XYZW')).toBe('ABCD…XYZW')
  })

  it('honors custom head and tail lengths', () => {
    expect(truncatePublicKey('ABCD1234567890XYZW', 2, 2)).toBe('AB…ZW')
    expect(truncatePublicKey('ABCD1234567890XYZW', 6, 3)).toBe('ABCD12…YZW')
  })

  it('returns the input verbatim when it is shorter than head + tail', () => {
    expect(truncatePublicKey('SHORT')).toBe('SHORT')
  })

  it('returns the input verbatim when length is exactly head + tail (no ellipsis added)', () => {
    expect(truncatePublicKey('ABCDWXYZ')).toBe('ABCDWXYZ')
  })

  it('returns the input verbatim for an empty string', () => {
    expect(truncatePublicKey('')).toBe('')
  })

  it('uses U+2026 horizontal ellipsis, not three ASCII dots', () => {
    // Locks the visual style consumers see; if anyone "fixes" this to
    // "..." they'll trip this test.
    const result = truncatePublicKey('ABCD1234567890XYZW')
    expect(result).toContain('…')
    expect(result).not.toContain('...')
  })

  it('handles head=0 / tail=0 (degenerate but well-defined)', () => {
    expect(truncatePublicKey('ABCDEFGH', 0, 0)).toBe('…')
    expect(truncatePublicKey('ABCDEFGH', 0, 3)).toBe('…FGH')
    expect(truncatePublicKey('ABCDEFGH', 3, 0)).toBe('ABC…')
  })

  it('clamps negative head / tail to 0 instead of producing garbled output', () => {
    // Without the clamp, `slice(0, -1)` interprets the negative as "all
    // but the last char" — producing nonsense for a "keep N chars at
    // the start" param. Lock the clamped behavior so a future change
    // that removes the clamp trips this test.
    expect(truncatePublicKey('ABCDEFGH', -1, 4)).toBe('…EFGH')
    expect(truncatePublicKey('ABCDEFGH', 4, -1)).toBe('ABCD…')
    expect(truncatePublicKey('ABCDEFGH', -10, -10)).toBe('…')
  })
})
