import { expect, test } from '@playwright/test'

test('recording mode plays hands-free with a watermark and no e-gift', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/g/demo?e2e=1&rec=1')
  await page.getByRole('button', { name: 'はじめる' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-rec', '1')
  await expect(page.locator('#watermark')).toBeVisible()
  await expect(page.locator('#dock')).toBeHidden()
  await page.screenshot({ path: 'e2e/screenshots/rec.png' })
  // No tap: the hero walks and the gift opens by itself.
  await expect(page.getByTestId('letter')).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('letter')).toHaveAttribute('data-typed', '1', { timeout: 15000 })
  await expect(page.locator('#egift')).toBeHidden()
  await expect(page.locator('#btn-egift')).toBeHidden()
})

test('a memory coin whose photo fails to load shows the placeholder', async ({ page }) => {
  await page.route('**/assets/photos/photo-1.png', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/g/demo?e2e=1')
  await page.getByRole('button', { name: 'はじめる' }).click()
  const photo = page.getByTestId('memory-photo')
  await expect(page.locator('#memory-text')).toHaveText('はじめて並んで歩いた日')
  await expect(photo).toHaveAttribute('src', '/assets/photos/placeholder.png')
  await expect(photo).toHaveJSProperty('complete', true)
  await expect(photo).toHaveJSProperty('naturalWidth', 40)
  await page.screenshot({ path: 'e2e/screenshots/coin-placeholder.png' })
})
