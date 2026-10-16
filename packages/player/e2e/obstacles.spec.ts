import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const labels = { easy: 'やさしい', normal: 'ふつう', hard: 'ちょい手ごわい' } as const

test('shows original obstacles on each difficulty', async ({ page }) => {
  test.setTimeout(90000)
  mkdirSync('e2e/screenshots', { recursive: true })
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    await page.goto(`/g/demo?difficulty=${difficulty}`)
    await page.getByRole('button', { name: 'はじめる' }).click()
    await expect(page.locator('#frame canvas')).toBeVisible()
    await expect(page.getByTestId('difficulty')).toHaveText(labels[difficulty])
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(6500)
    await page.screenshot({ path: `e2e/screenshots/obstacles-${difficulty}.png` })
    await page.keyboard.up('ArrowRight')
  }
})
