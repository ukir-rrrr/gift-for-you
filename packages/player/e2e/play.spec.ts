import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

test('plays the demo gift through the letter', async ({ page }) => {
  mkdirSync('e2e/screenshots', { recursive: true })
  await page.goto('/g/demo?e2e=1')
  await expect(page.getByTestId('title')).toHaveText('彩へ、ちょっとした冒険を')
  await page.screenshot({ path: 'e2e/screenshots/title.png' })
  await page.getByRole('button', { name: 'はじめる' }).click()
  await expect(page.locator('#frame canvas')).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/play.png' })
  await expect(page.getByTestId('memory-popup')).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/coin.png' })
  await expect(page.getByTestId('prompt')).toBeVisible({ timeout: 20000 })
  await page.screenshot({ path: 'e2e/screenshots/pedestal.png' })
  await page.getByTestId('prompt').click()
  await expect(page.getByTestId('letter')).toBeVisible()
  await expect(page.locator('#letter-body')).toContainText('健太', { timeout: 10000 })
  await expect(page.locator('#letter-body')).toHaveText(/箱の中は、ずっと渡したかったマフラー。/)
  await page.screenshot({ path: 'e2e/screenshots/letter.png' })
})

test('missing and expired gifts share one error', async ({ page }) => {
  await page.goto('/g/not-a-gift')
  const missing = await page.getByTestId('error').innerText()
  await page.goto('/g/expired')
  const expired = await page.getByTestId('error').innerText()
  expect(missing).toBe(expired)
  expect(missing).toContain('見つかりません')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
})
