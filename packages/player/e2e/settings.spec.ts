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

test('Space on a focused button presses it instead of jumping', async ({ page }) => {
  await page.goto('/g/demo?e2e=1')
  const start = page.getByRole('button', { name: 'はじめる' })
  await expect(start).toBeEnabled()
  await start.focus()
  await page.keyboard.press(' ')
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'play')
})

test('the dev beacon endpoint refuses oversized bodies', async ({ request }) => {
  const big = await request.post('/s/demo/events', { data: { type: 'opened', pad: 'x'.repeat(4096) } })
  expect(big.status()).toBe(413)
  const ok = await request.post('/s/demo/events', { data: { type: 'opened' } })
  expect(ok.status()).toBe(204)
})
