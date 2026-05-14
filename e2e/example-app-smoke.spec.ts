import { expect, test, type ConsoleMessage } from '@playwright/test'

/**
 * Smoke test for the React example app (`examples/react-example/`).
 *
 * Visits each of the four demo routes (`#basic`, `#siws`, `#priority`,
 * `#neutral`), opens the wallet modal on each, and verifies:
 *
 * 1. The Connect Wallet button is present.
 * 2. The dialog opens with the expected list of wallets.
 * 3. **No uncaught errors fire** during the journey — no `console.error`
 *    messages, no `pageerror` events, no unhandled promise rejections.
 *
 * Per PLAN.md TASK-601 "Tests Required: Playwright smoke test that the
 * example loads without console errors."
 *
 * Runs in the default `desktop-chromium` project. Mobile / multi-engine
 * coverage of the underlying library lives in the other spec files; this
 * test is about catching example-app regressions, not engine differences.
 */

type ConsoleCapture = {
  errors: { text: string; route: string }[]
  pageErrors: { text: string; route: string }[]
}

function attachCapture(
  page: import('@playwright/test').Page,
  capture: ConsoleCapture,
): {
  setRoute: (route: string) => void
} {
  let currentRoute = '<initial>'

  const consoleHandler = (msg: ConsoleMessage): void => {
    // Only flag errors — warnings (e.g., React dev hints) are noisy and
    // not the concern of this smoke test.
    if (msg.type() !== 'error') return
    capture.errors.push({ text: msg.text(), route: currentRoute })
  }
  const pageErrorHandler = (err: Error): void => {
    capture.pageErrors.push({ text: err.message, route: currentRoute })
  }
  page.on('console', consoleHandler)
  page.on('pageerror', pageErrorHandler)

  return {
    setRoute: (route) => {
      currentRoute = route
    },
  }
}

test.describe('Example app smoke', () => {
  test('every demo route loads, opens its modal, and stays error-free', async ({ page }) => {
    const capture: ConsoleCapture = { errors: [], pageErrors: [] }
    const { setRoute } = attachCapture(page, capture)

    const routes = [
      { hash: '', label: 'Basic' },
      { hash: '#siws', label: 'SIWS sign-in' },
      { hash: '#priority', label: 'Custom priority' },
      { hash: '#neutral', label: 'Neutral (no pin)' },
    ]

    for (const { hash, label } of routes) {
      setRoute(label)
      await page.goto(`/${hash}`)

      // The Connect Wallet button is the consistent landmark across
      // demos — present on every route.
      const connect = page.getByRole('button', { name: /connect wallet/i })
      await expect(connect).toBeVisible()

      // Opening the modal exercises the manager-init + sortedWallets
      // codepath; if the demo's config has a regression it'll throw here.
      await connect.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      // Every demo carries the three configured wallets — they should
      // all render regardless of platform / pinning / priority rules.
      await expect(dialog.locator('[data-wallet-id="opindex"]')).toBeVisible()
      await expect(dialog.locator('[data-wallet-id="phantom"]')).toBeVisible()
      await expect(dialog.locator('[data-wallet-id="solflare"]')).toBeVisible()

      // Close before the next iteration so the next nav starts clean.
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
    }

    // Final assertion — no console errors or page errors anywhere in
    // the journey.
    expect(capture.errors, `console errors: ${JSON.stringify(capture.errors)}`).toEqual([])
    expect(capture.pageErrors, `page errors: ${JSON.stringify(capture.pageErrors)}`).toEqual([])
  })

  test('hash-route navigation switches the visible demo', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-route="basic"][aria-current="page"]')).toBeVisible()

    await page.getByRole('link', { name: 'SIWS sign-in' }).click()
    await expect(page.locator('[data-route="siws"][aria-current="page"]')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 })).toContainText('Sign-In With Solana')

    await page.getByRole('link', { name: 'Neutral (no pin)' }).click()
    await expect(page.locator('[data-route="neutral"][aria-current="page"]')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 })).toContainText('Neutral mode')
  })

  test('neutral demo does NOT pin Opindex first on mobile-emulated viewport', async ({
    browser,
  }) => {
    // Re-use the iPhone-emulated context the playwright config exposes
    // via the `mobile-iphone` project for the underlying engine flow,
    // but here we run inline so we can drop the user agent into a smoke
    // context that visits `#neutral` specifically.
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
    })
    const mobilePage = await ctx.newPage()
    try {
      await mobilePage.goto('/#neutral')
      await mobilePage.getByRole('button', { name: /connect wallet/i }).click()

      const dialog = mobilePage.getByRole('dialog')
      await expect(dialog).toBeVisible()
      // With pinnedWallet: null, even on mobile Opindex sorts purely by
      // priority — Phantom (priority 1) should be first, not Opindex.
      const firstId = await dialog
        .locator('[data-wallet-id]')
        .first()
        .getAttribute('data-wallet-id')
      expect(firstId).toBe('phantom')
    } finally {
      await ctx.close()
    }
  })
})
