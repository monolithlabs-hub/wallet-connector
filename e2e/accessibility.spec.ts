import { expect, test } from '@playwright/test'

/**
 * Accessibility specs — verifies the `<ConnectButton>` modal meets the
 * WAI-ARIA modal-dialog pattern in a real browser. Distinct from the
 * jsdom unit tests because focus management and the browser's native
 * Tab traversal can diverge from `compareDocumentPosition` ordering;
 * running in real browsers catches those mismatches.
 *
 * Runs on a single desktop browser per the playwright.config projects
 * matrix — ARIA + focus + keyboard behavior is browser-agnostic at the
 * granularity we test.
 */

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /connect wallet/i })).toBeVisible()
  })

  test('modal has correct ARIA attributes', async ({ page }) => {
    await page.getByRole('button', { name: /connect wallet/i }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    // `aria-labelledby` must point at an element whose text names the
    // dialog. Read the attribute, find the labelling element, assert
    // it carries the modal title.
    const labelledBy = await dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    const title = page.locator(`#${labelledBy}`)
    await expect(title).toHaveText(/select a wallet/i)
  })

  test('Escape key closes the modal', async ({ page }) => {
    await page.getByRole('button', { name: /connect wallet/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('focus is trapped inside the modal', async ({ page }) => {
    await page.getByRole('button', { name: /connect wallet/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Initial focus is moved into the modal by `attachModal` — first
    // focusable is the Close button.
    const closeButton = dialog.getByRole('button', { name: /close/i })
    await expect(closeButton).toBeFocused()

    // Tab through all focusables; each should remain INSIDE the
    // dialog. We don't know the exact count without coupling to the
    // wallet list size, so iterate "Tab" several times and assert at
    // each step that the active element is a descendant of the
    // dialog.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      const activeInDialog = await dialog.evaluate((node) => node.contains(document.activeElement))
      expect(activeInDialog, `after ${i + 1} Tab(s)`).toBe(true)
    }
  })

  test('Shift+Tab from the first focusable wraps to the last', async ({ page }) => {
    await page.getByRole('button', { name: /connect wallet/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // The Close button is the first focusable (it's auto-focused on
    // open). Shift+Tab from it should wrap to the LAST focusable —
    // which is the last wallet item in the list.
    const closeButton = dialog.getByRole('button', { name: /close/i })
    await expect(closeButton).toBeFocused()

    // Resolve the last wallet item from the DOM so the assertion is
    // independent of the wallet list size / ordering in the example
    // app.
    const walletIds = await dialog
      .locator('[data-wallet-id]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-wallet-id') ?? ''))
    expect(walletIds.length, 'modal must render at least one wallet').toBeGreaterThan(0)
    const lastWalletId = walletIds.at(-1)!

    await page.keyboard.press('Shift+Tab')

    // Focus must wrap to the LAST focusable — the last wallet button
    // in document order. This is the actual contract of the focus
    // trap; merely "left the close button" is too weak.
    await expect(dialog.locator(`[data-wallet-id="${lastWalletId}"]`)).toBeFocused()
  })

  test('all interactive elements inside the modal are keyboard reachable', async ({ page }) => {
    await page.getByRole('button', { name: /connect wallet/i }).click()
    const dialog = page.getByRole('dialog')

    // Enumerate every <button> inside the dialog — the modal renders
    // wallet list items + Close, all as buttons.
    const buttons = await dialog.locator('button').all()
    expect(buttons.length).toBeGreaterThan(0)

    // Tab through the dialog and collect which buttons received focus.
    // Cap at `buttons.length + 2` Tabs to guarantee we cycle past every
    // focusable AND wrap once.
    const focusedIds = new Set<string>()
    for (let i = 0; i < buttons.length + 2; i++) {
      const id = await dialog.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el) return ''
        return el.getAttribute('data-wallet-id') ?? el.getAttribute('aria-label') ?? el.tagName
      })
      focusedIds.add(id)
      await page.keyboard.press('Tab')
    }

    // Close button is reached (auto-focused on open) + every wallet
    // button is reached by Tab traversal.
    expect(focusedIds.has('Close')).toBe(true)
    // At least every wallet item should appear in the focus set.
    const expectedWalletIds = await dialog
      .locator('[data-wallet-id]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-wallet-id') ?? ''))
    for (const walletId of expectedWalletIds) {
      expect(focusedIds, `wallet "${walletId}" must be keyboard reachable`).toContain(walletId)
    }
  })

  test('focus is restored to the trigger button when the modal closes', async ({ page }) => {
    const trigger = page.getByRole('button', { name: /connect wallet/i })
    await trigger.focus()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // attachModal's destroy() restores focus to the previously-active
    // element — the Connect Wallet trigger.
    await expect(trigger).toBeFocused()
  })
})
