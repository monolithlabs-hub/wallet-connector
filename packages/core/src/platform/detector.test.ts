import { afterEach, describe, expect, it, vi } from 'vitest'

import { detectPlatform } from './detector'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
const MAC_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

describe('detectPlatform', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('detects mobile Safari (iPhone, no window.solana)', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA })

    expect(detectPlatform()).toEqual({
      isMobile: true,
      isIOS: true,
      isAndroid: false,
      hasExtension: false,
      hasOpindexExtension: false,
      strategy: 'deeplink',
    })
  })

  it('detects Android Chrome (no window.solana)', () => {
    vi.stubGlobal('navigator', { userAgent: ANDROID_UA })

    expect(detectPlatform()).toEqual({
      isMobile: true,
      isIOS: false,
      isAndroid: true,
      hasExtension: false,
      hasOpindexExtension: false,
      strategy: 'deeplink',
    })
  })

  it('detects desktop with Phantom extension', () => {
    vi.stubGlobal('navigator', { userAgent: MAC_DESKTOP_UA })
    vi.stubGlobal('solana', { isPhantom: true })

    expect(detectPlatform()).toEqual({
      isMobile: false,
      isIOS: false,
      isAndroid: false,
      hasExtension: true,
      hasOpindexExtension: false,
      strategy: 'extension',
    })
  })

  it('detects desktop with Opindex extension', () => {
    vi.stubGlobal('navigator', { userAgent: MAC_DESKTOP_UA })
    vi.stubGlobal('solana', { isOpindex: true })
    vi.stubGlobal('opindex', { isOpindex: true })

    expect(detectPlatform()).toEqual({
      isMobile: false,
      isIOS: false,
      isAndroid: false,
      hasExtension: true,
      hasOpindexExtension: true,
      strategy: 'extension',
    })
  })

  it('detects Phantom in-app browser (mobile UA + window.solana → extension wins)', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA })
    vi.stubGlobal('solana', { isPhantom: true })

    expect(detectPlatform()).toEqual({
      isMobile: true,
      isIOS: true,
      isAndroid: false,
      hasExtension: true,
      hasOpindexExtension: false,
      strategy: 'extension',
    })
  })

  it('detects desktop with no extension → install-prompt', () => {
    vi.stubGlobal('navigator', { userAgent: MAC_DESKTOP_UA })

    expect(detectPlatform()).toEqual({
      isMobile: false,
      isIOS: false,
      isAndroid: false,
      hasExtension: false,
      hasOpindexExtension: false,
      strategy: 'install-prompt',
    })
  })

  it('treats opindex without isOpindex=true as not the Opindex extension', () => {
    vi.stubGlobal('navigator', { userAgent: MAC_DESKTOP_UA })
    vi.stubGlobal('opindex', {})

    expect(detectPlatform().hasOpindexExtension).toBe(false)
  })

  it('does not throw in SSR environment (no window, no navigator)', () => {
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('navigator', undefined)

    expect(() => detectPlatform()).not.toThrow()
    expect(detectPlatform()).toEqual({
      isMobile: false,
      isIOS: false,
      isAndroid: false,
      hasExtension: false,
      hasOpindexExtension: false,
      strategy: 'install-prompt',
    })
  })
})
