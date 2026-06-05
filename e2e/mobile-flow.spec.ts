import { expect, test } from '@playwright/test'

/**
 * Mobile flow specs — runs on iPhone 14 (iOS Safari emulation) and
 * Pixel 7 (Android Chrome emulation). The two share most assertions
 * but diverge on:
 *
 * - Badge label: iPhone shows "Get" (App Store convention); Pixel
 *   shows "Install" (Play Store).
 * - Fallback URL: iPhone navigates to `appStoreUrl`; Pixel to
 *   `playStoreUrl`.
 *
 * Network interception: we route all third-party origin requests
 * through a callback that captures the URL and aborts the request, so
 * Playwright doesn't actually leave the test page when the wallet
 * adapter does `window.location.href = '<universal-link>'`.
 */

/**
 * Hostnames the DeepLinkAdapter may navigate to. Matched against
 * `new URL(url).hostname` exactly so a stray substring in a path (e.g.
 * a query param mentioning "phantom.app") doesn't false-positive.
 */
const THIRD_PARTY_HOSTS = new Set([
  'opindex.app',
  'opindex.deeptap.io',
  'phantom.app',
  'solflare.com',
  'apps.apple.com',
  'play.google.com',
])

function isThirdPartyNavigation(url: string): boolean {
  try {
    return THIRD_PARTY_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

test.describe('Mobile flow', () => {
  test('Opindex appears first in the wallet list', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const dialog = page.getByRole('dialog')
    const walletIds = await dialog
      .locator('[data-wallet-id]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-wallet-id') ?? ''))

    // Mobile pin is unconditional — Opindex is always index 0 on
    // mobile regardless of whether the user has previously connected
    // with it (iOS can't probe for installed apps).
    expect(walletIds[0]).toBe('opindex')
  })

  test('Opindex carries the install-prompt badge on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only behavior')
    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const opindex = page.locator('[data-wallet-id="opindex"]').first()
    await expect(opindex).toBeVisible()
    // The label differs by platform per the ui package's
    // `getInstallBadge` helper:
    // - iOS Safari → "Get" (App Store convention)
    // - Android Chrome → "Install" (Play Store convention)
    const userAgent = await page.evaluate(() => navigator.userAgent)
    const expectedLabel = /iPhone|iPad|iPod/.test(userAgent) ? 'Get' : 'Install'
    await expect(opindex).toContainText(expectedLabel)
  })

  test('tapping Opindex starts a mobile deep-link connect, then falls back to the install page', async ({
    page,
  }) => {
    const capturedNavigations: string[] = []

    // Intercept all third-party origin requests so Playwright doesn't
    // actually navigate away to opindex.deeptap.io. Each captured URL
    // ends up in `capturedNavigations` for later assertion.
    await page.route('**/*', async (route) => {
      const url = route.request().url()
      if (isThirdPartyNavigation(url)) {
        capturedNavigations.push(url)
        // `route.fulfill({status: 204})` over `route.abort()`: Chromium
        // navigates to a `chrome-error://` page on `abort()`. A 204 No
        // Content response leaves the page state intact (and visible) on
        // all browsers — which is what lets the store-fallback timer fire.
        await route.fulfill({ status: 204, body: '' })
      } else {
        await route.continue()
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const opindex = page.locator('[data-wallet-id="opindex"]').first()
    await expect(opindex).toBeVisible()
    await opindex.click()

    // Opindex is a mobile deep-link wallet (universalLink set): the first
    // navigation is the universal-link connect URL carrying the encrypted
    // handshake param `dapp_encryption_public_key`.
    await expect.poll(() => capturedNavigations.length).toBeGreaterThanOrEqual(1)
    expect(capturedNavigations[0]).toMatch(
      /^https:\/\/opindex\.deeptap\.io\/?\?.*dapp_encryption_public_key=/,
    )

    // The deep link was intercepted, so the OS never opened the app and the
    // page stays visible — the Opindex-specific 1500ms store fallback then
    // fires a second navigation to the bare install / landing page.
    await expect.poll(() => capturedNavigations.length, { timeout: 4_000 }).toBe(2)
    expect(capturedNavigations[1]).toMatch(/^https:\/\/opindex\.deeptap\.io\/?$/)
  })

  test('returning after an abandoned deep link re-enables the wallet list (issue 2)', async ({
    page,
  }) => {
    // Keep the page alive when the deep-link adapter navigates to the
    // wallet (204 instead of a real navigation).
    await page.route('**/*', async (route) => {
      if (isThirdPartyNavigation(route.request().url())) {
        await route.fulfill({ status: 204, body: '' })
      } else {
        await route.continue()
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()

    // Tap Solflare (a real deep-link wallet). It navigates away; the flow
    // enters 'connecting', which disables every wallet row.
    await page.locator('[data-wallet-id="solflare"]').first().click()

    const opindexButton = page.locator('button[data-wallet-id="opindex"]').first()
    await expect(opindexButton).toBeDisabled()

    // User switches back to the browser WITHOUT completing the connection.
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('pageshow'))
    })

    // The modal un-freezes: wallet rows are clickable again.
    await expect(opindexButton).toBeEnabled()
  })

  test('App Store fallback does NOT fire if user picks Phantom (non-pinned wallet)', async ({
    page,
  }) => {
    const capturedNavigations: string[] = []
    await page.route('**/*', async (route) => {
      const url = route.request().url()
      if (isThirdPartyNavigation(url)) {
        capturedNavigations.push(url)
        // `route.fulfill({status: 204})` over `route.abort()`: Chromium
        // navigates to a `chrome-error://` page on `abort()`,
        // destroying the React context before the 1500ms fallback can
        // fire. A 204 No Content response leaves the page state intact
        // on all browsers — Chromium, WebKit, and Firefox — and the
        // captured URL is enough for the assertion.
        await route.fulfill({ status: 204, body: '' })
      } else {
        await route.continue()
      }
    })

    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()
    await page.locator('[data-wallet-id="phantom"]').first().click()

    // Phantom isn't the pinned wallet — DeepLinkAdapter calls
    // `navigate(deepLinkUrl)` directly without scheduling a fallback.
    // Verify only ONE navigation fires (the universal link) and no
    // store URL after 2 seconds.
    await expect.poll(() => capturedNavigations.length).toBeGreaterThanOrEqual(1)
    expect(capturedNavigations[0]).toMatch(/^https:\/\/phantom\.app\/ul\/v1\/connect/)

    // Give the (non-existent) fallback a chance to fire. After 2s of
    // wall clock, still only one navigation.
    await page.waitForTimeout(2_000)
    expect(capturedNavigations).toHaveLength(1)
  })
})
