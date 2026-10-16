import { devices, expect, test } from '@playwright/test'

const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13']

test.describe('phone held sideways', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })
  test('asks to turn the phone until it is upright', async ({ page }) => {
    await page.goto('/g/demo?e2e=1')
    await expect(page.locator('#rotate')).toBeVisible()
    await expect(page.locator('#rotate')).toHaveText('たてむきにしてね')
    await page.screenshot({ path: 'e2e/screenshots/rotate.png' })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('#rotate')).toBeHidden()
    await expect(page.locator('body')).toHaveAttribute('data-rotate', '0')
  })
})

test.describe('desktop window', () => {
  test.use({ viewport: { width: 1280, height: 720 } })
  test('letterboxes a 9:16 frame without the rotate prompt', async ({ page }) => {
    await page.goto('/g/demo?e2e=1')
    await expect(page).toHaveTitle('彩へ、ちょっとした冒険を')
    await page.getByRole('button', { name: 'はじめる' }).click()
    await expect(page.locator('#rotate')).toBeHidden()
    const box = await page.locator('#frame').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width / box!.height).toBeCloseTo(9 / 16, 3)
  })
})

test.describe('iPhone', () => {
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch })
  test('keeps the frame 9:16 and the pad below it', async ({ page }) => {
    await page.goto('/g/demo?e2e=1')
    await page.getByRole('button', { name: 'はじめる' }).tap()
    const frame = await page.locator('#frame').boundingBox()
    const pad = await page.getByTestId('pad').boundingBox()
    expect(frame!.width / frame!.height).toBeCloseTo(9 / 16, 3)
    expect(pad!.y).toBeGreaterThanOrEqual(frame!.y + frame!.height)
    expect(pad!.y + pad!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  })
})
