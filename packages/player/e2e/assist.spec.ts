import { expect, test } from '@playwright/test'

test('offers help after three misses and skips ahead with the section coins', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/g/demo?difficulty=normal')
  await page.getByRole('button', { name: 'はじめる' }).click()
  await expect(page.locator('#frame canvas')).toBeVisible()
  // Walking right without jumping runs into the first obstacles again and again.
  await page.keyboard.down('ArrowRight')
  await expect(page.getByTestId('assist')).toBeVisible({ timeout: 60000 })
  await page.keyboard.up('ArrowRight')
  await page.screenshot({ path: 'e2e/screenshots/assist.png' })
  const before = await page.locator('#section').innerText()
  await page.getByRole('button', { name: 'この先へ' }).click()
  await expect(page.getByTestId('assist')).toBeHidden()
  await expect(page.locator('#section')).not.toHaveText(before)
  await expect(page.getByTestId('memory-popup')).toBeVisible()
})

test('easy help walks on by itself', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/g/demo?difficulty=normal')
  await page.getByRole('button', { name: 'はじめる' }).click()
  await page.keyboard.down('ArrowRight')
  await expect(page.getByTestId('assist')).toBeVisible({ timeout: 60000 })
  await page.keyboard.up('ArrowRight')
  await page.locator('#assist').getByRole('button', { name: 'かんたん' }).click()
  await expect(page.getByTestId('assist')).toBeHidden()
  await expect(page.locator('#btn-easy')).toHaveText('かんたん中')
})
