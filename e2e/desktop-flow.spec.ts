import { expect, test } from '@playwright/test'

/**
 * Desktop flow specs — verifies the wallet-modal sort order responds
 * correctly to `window.opindex` presence/absence in real browsers.
 *
 * The Opindex pinning rule on desktop (per TASK-102):
 * - Without `window.opindex` injected → Opindex is NOT pinned first.
 *   It sorts by priority alongside the other wallets.
 * - With `window.opindex.isOpindex === true` → Opindex is pinned at
 *   index 0.
 *
 * Each test uses `page.addInitScript` to inject (or not) the global
 * BEFORE the React app mounts. The script runs in the page's context
 * before any framework code.
 */

test.describe('Desktop flow', () => {
  test('wallet modal opens on button click', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.getByRole('button', { name: /connect wallet/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('Opindex is NOT shown first without the extension', async ({ page }) => {
    // No window.opindex injection — the default page state.
    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const dialog = page.getByRole('dialog')
    const walletIds = await dialog
      .locator('[data-wallet-id]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-wallet-id') ?? ''))

    expect(walletIds.length).toBeGreaterThan(0)
    // Phantom has the lowest priority number (1) in the example app
    // config, so it sorts to the top when Opindex isn't pinned.
    expect(walletIds[0]).toBe('phantom')
    // Opindex must NOT be at index 0.
    expect(walletIds[0]).not.toBe('opindex')
  })

  test('Opindex IS shown first when window.opindex is injected', async ({ page }) => {
    // Inject window.opindex BEFORE the page loads — `addInitScript`
    // queues this to run on every navigation, so the React app sees
    // the sentinel during its initial `detectPlatform()` call.
    await page.addInitScript(() => {
      ;(window as unknown as { opindex: { isOpindex: true } }).opindex = {
        isOpindex: true,
      }
    })
    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const dialog = page.getByRole('dialog')
    const walletIds = await dialog
      .locator('[data-wallet-id]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-wallet-id') ?? ''))

    expect(walletIds[0]).toBe('opindex')
  })

  test('Opindex carries the "Install" badge on desktop without the extension', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const opindexButton = page.locator('[data-wallet-id="opindex"]')
    await expect(opindexButton).toBeVisible()
    await expect(opindexButton).toContainText('Install')
  })

  test('clicking Opindex without the extension opens the Chrome Web Store in a new tab', async ({
    page,
    context,
  }) => {
    // Intercept the Chrome Web Store navigation so the popup doesn't actually
    // hit the network. Serve a 200 stub so the popup navigates to (and parks
    // on) the requested URL — a 204 would leave it on about:blank.
    await context.route('**/chromewebstore.google.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }),
    )

    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const opindexButton = page.locator('[data-wallet-id="opindex"]')
    await expect(opindexButton).toBeVisible()

    // The manager calls window.open(extensionUrl, '_blank', ...) — a new tab.
    const [popup] = await Promise.all([context.waitForEvent('page'), opindexButton.click()])
    await popup.waitForURL(/chromewebstore\.google\.com/)
    expect(new URL(popup.url()).hostname).toBe('chromewebstore.google.com')
    await popup.close()
  })

  test('Opindex carries the "Detected" badge on desktop with the extension', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { opindex: { isOpindex: true } }).opindex = {
        isOpindex: true,
      }
    })
    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const opindexButton = page.locator('[data-wallet-id="opindex"]')
    await expect(opindexButton).toBeVisible()
    await expect(opindexButton).toContainText('Detected')
    await expect(opindexButton).not.toContainText('Install')
    await expect(opindexButton).not.toContainText('Get')
  })

  /**
   * The real Opindex extension does NOT inject any `window.opindex`
   * sentinel — it only registers via the Wallet Standard event-based
   * registry. The library still has to detect it. These tests pin that
   * behavior end-to-end: a `wallet-standard:app-ready` listener that
   * registers a minimal Wallet-Standard-compliant Opindex wallet should
   * cause the dapp to (a) sort Opindex first on desktop, (b) drop the
   * "Install" badge.
   */
  test('Opindex IS shown first when registered via Wallet Standard (no window.opindex)', async ({
    page,
  }) => {
    await page.addInitScript(registerFakeWalletStandard, 'Opindex')
    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const dialog = page.getByRole('dialog')
    const walletIds = await dialog
      .locator('[data-wallet-id]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-wallet-id') ?? ''))

    expect(walletIds[0]).toBe('opindex')
  })

  test('Opindex carries the "Detected" badge when registered via Wallet Standard', async ({
    page,
  }) => {
    await page.addInitScript(registerFakeWalletStandard, 'Opindex')
    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const opindexButton = page.locator('[data-wallet-id="opindex"]')
    await expect(opindexButton).toBeVisible()
    await expect(opindexButton).toContainText('Detected')
    await expect(opindexButton).not.toContainText('Install')
    await expect(opindexButton).not.toContainText('Get')
  })

  test('discovered-only wallet (not in the config) appears with "Detected"', async ({ page }) => {
    // Backpack isn't in the example app's `wallets[]`. When its Wallet
    // Standard registration lands, the manager's `mergeWalletList` adds
    // it as a `source: 'discovered'` entry so it shows up in the modal.
    await page.addInitScript(registerFakeWalletStandard, 'Backpack')
    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const backpack = page.locator('[data-wallet-id="backpack"]')
    await expect(backpack).toBeVisible()
    await expect(backpack).toContainText('Backpack')
    await expect(backpack).toContainText('Detected')
  })

  test('Phantom shows "Detected" badge when registered via Wallet Standard', async ({ page }) => {
    // Phantom is configured AND auto-detected. The configured row still
    // wins (single row, `source: 'configured'`), but its `isDetected`
    // flag flips to true via the merge.
    await page.addInitScript(registerFakeWalletStandard, 'Phantom')
    await page.goto('/')
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const phantomButton = page.locator('[data-wallet-id="phantom"]')
    await expect(phantomButton).toBeVisible()
    await expect(phantomButton).toContainText('Detected')
  })

  test('CSS variable override applies to the dialog background', async ({ page }) => {
    // Inject a fresh `--wc-bg` value at the document root; the modal's
    // dialog reads it via `var(--wc-bg, …)` so the computed background
    // color should match.
    await page.goto('/')
    await page.addStyleTag({ content: ':root { --wc-bg: rgb(0, 100, 200); }' })
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const bg = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toBe('rgb(0, 100, 200)')
  })
})

/**
 * Init-script payload run before any framework code on the page. Listens
 * for the dapp's `wallet-standard:app-ready` dispatch and registers a
 * minimal Opindex-shaped Wallet Standard wallet — mirrors what the real
 * Opindex content-script does in production.
 *
 * Also sets a placeholder `window.solana` so `detectPlatform()` resolves
 * to `'extension'` strategy. In production this is always set by some
 * installed wallet (Phantom, etc.); the library's strategy detector
 * doesn't yet treat a Wallet-Standard-only wallet as sufficient on its
 * own. That's a follow-up; for this regression test we only care that
 * once the discovery handle exists, a registry-only Opindex is
 * recognized.
 */
/**
 * Init-script body. Self-contained so `addInitScript` can serialize it
 * via `toString()` and run it in the page context with no closure
 * references. Sets `window.solana` so `detectPlatform` resolves to
 * `'extension'`, then registers a minimal Wallet Standard wallet under
 * the given name on the `wallet-standard:app-ready` event. The name is
 * passed via Playwright's `addInitScript(fn, arg)` second-arg overload.
 */
function registerFakeWalletStandard(walletName: string): void {
  ;(window as unknown as { solana?: unknown }).solana = { isAnyWallet: true }
  const fakeWallet = {
    version: '1.0.0',
    name: walletName,
    icon: 'data:image/svg+xml;base64,',
    chains: ['solana:mainnet'],
    accounts: [],
    features: {
      'standard:connect': {
        version: '1.0.0',
        connect: async () => ({ accounts: [] }),
      },
      'standard:disconnect': {
        version: '1.0.0',
        disconnect: async () => {},
      },
      'standard:events': {
        version: '1.0.0',
        on: () => () => {},
      },
      'solana:signMessage': {
        version: '1.0.0',
        signMessage: async () => [{ signedMessage: new Uint8Array(), signature: new Uint8Array() }],
      },
    },
  }
  window.addEventListener('wallet-standard:app-ready', (e) => {
    const detail = (e as CustomEvent<{ register: (wallet: unknown) => () => void }>).detail
    detail?.register?.(fakeWallet)
  })
}
