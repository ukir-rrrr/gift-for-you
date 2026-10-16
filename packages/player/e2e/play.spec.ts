import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

async function playToGoal(page: Page, id: string, shots = false) {
  await page.goto(`/g/${id}?e2e=1`)
  await expect(page.getByTestId('title')).toHaveText('彩へ、ちょっとした冒険を')
  if (shots) await page.screenshot({ path: 'e2e/screenshots/title.png' })
  await page.getByRole('button', { name: 'はじめる' }).click()
  await expect(page.locator('#frame canvas')).toBeVisible()
  if (shots) await page.screenshot({ path: 'e2e/screenshots/play.png' })
  await expect(page.getByTestId('memory-popup')).toBeVisible()
  if (shots) await page.screenshot({ path: 'e2e/screenshots/coin.png' })
  await expect(page.getByTestId('prompt')).toBeVisible({ timeout: 20000 })
  if (shots) await page.screenshot({ path: 'e2e/screenshots/pedestal.png' })
}

test('plays the demo gift through three opening beats and the letter', async ({ page }) => {
  mkdirSync('e2e/screenshots', { recursive: true })
  await playToGoal(page, 'demo', true)
  await expect(page.getByTestId('title')).toBeHidden()
  // The e-gift is never reachable before the goal.
  await expect(page.locator('#btn-egift')).toBeHidden()
  await page.getByTestId('prompt').click()
  const body = page.locator('body')
  for (const beat of ['shake', 'burst', 'show']) {
    await expect(body).toHaveAttribute('data-beat', beat)
    await page.screenshot({ path: `e2e/screenshots/beat-${beat}.png` })
  }
  await expect(page.getByTestId('letter')).toBeVisible()
  await expect(page.locator('#letter-body')).toContainText('健太', { timeout: 10000 })
  await expect(page.locator('#letter-body')).toHaveText(/箱の中は、ずっと渡したかったマフラー。/)
  await expect(page.getByTestId('letter')).toHaveAttribute('data-typed', '1')
  await page.screenshot({ path: 'e2e/screenshots/letter.png' })

  await page.getByRole('button', { name: 'eギフトを受け取る' }).click()
  await expect(page.locator('#confirm-domain')).toHaveText('giftee.com')
  await expect(page.locator('#confirm-warn')).toBeHidden()
  await expect(page.locator('#confirm-go')).toHaveAttribute('href', 'https://giftee.com/cards/demo')
  await expect(page.locator('#confirm-go')).toHaveAttribute('rel', 'noopener noreferrer')
  await page.screenshot({ path: 'e2e/screenshots/egift-confirm.png' })
  await page.getByRole('button', { name: 'やめる' }).click()
  await expect(page.locator('#confirm')).toBeHidden()
})

test('tapping the letter finishes typing, and an off-list domain is warned', async ({ page }) => {
  await playToGoal(page, 'offlist')
  await page.getByTestId('prompt').click()
  await expect(page.getByTestId('letter')).toBeVisible({ timeout: 10000 })
  await page.locator('#letter-body').click()
  await expect(page.getByTestId('letter')).toHaveAttribute('data-typed', '1', { timeout: 1000 })
  await page.getByRole('button', { name: 'eギフトを受け取る' }).click()
  await expect(page.locator('#confirm-domain')).toHaveText('shop.example')
  await expect(page.locator('#confirm-warn')).toHaveText('このドメインは確認リストにありません')
  await expect(page.locator('#confirm-go')).toHaveText('それでも開く')
  await page.screenshot({ path: 'e2e/screenshots/egift-warn.png' })
})

test('missing and expired gifts share one error', async ({ page }) => {
  await page.goto('/g/not-a-gift')
  const missing = await page.getByTestId('error').innerText()
  const missingTitle = await page.title()
  await page.goto('/g/expired')
  const expired = await page.getByTestId('error').innerText()
  expect(missing).toBe(expired)
  expect(await page.title()).toBe(missingTitle)
  expect(missing).toContain('見つかりません')
  await page.goto('/#/g/%')
  await expect(page.getByTestId('error')).toHaveText(missing)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  const res = await page.request.get('/g/expired')
  expect(res.headers()['x-robots-tag']).toContain('noindex')
})
