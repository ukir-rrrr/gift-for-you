import { expect, test } from '@playwright/test'

test('mute and flash choices survive a reload', async ({ page }) => {
  await page.goto('/g/demo?e2e=1')
  await page.getByRole('button', { name: 'はじめる' }).click()
  await page.locator('#btn-mute').click()
  await page.locator('#btn-flash').click()
  await expect(page.locator('#btn-mute')).toHaveText('おと オフ')
  await expect(page.locator('body')).toHaveAttribute('data-flash', 'reduced')
  await page.reload()
  await page.getByRole('button', { name: 'はじめる' }).click()
  await expect(page.locator('#btn-mute')).toHaveText('おと オフ')
  await expect(page.locator('#btn-mute')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#btn-flash')).toHaveText('てんめつ なし')
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  test('starts with flashing reduced', async ({ page }) => {
    await page.goto('/g/demo?e2e=1')
    await page.getByRole('button', { name: 'はじめる' }).click()
    await expect(page.locator('body')).toHaveAttribute('data-flash', 'reduced')
  })
})
