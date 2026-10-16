import { expect, test, type CDPSession, type Locator } from '@playwright/test'
import { mkdirSync } from 'node:fs'

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })

const shots = process.env.PAD_SHOTS ?? 'e2e/screenshots'

type Finger = { id: number; x: number; y: number }

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('pad button not laid out')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', fingers: Finger[]) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: fingers.map((f) => ({ ...f, radiusX: 4, radiusY: 4 })) })
}

test('drives the hero with the on-screen pad', async ({ page }) => {
  mkdirSync(shots, { recursive: true })
  await page.goto('/g/demo?e2e=1')
  await page.getByRole('button', { name: 'はじめる' }).tap()
  await expect(page.locator('#frame canvas')).toBeVisible()
  // e2e mode auto-walks; turn that off so only the pad moves the hero.
  await page.locator('#btn-easy').tap()
  const pad = page.getByTestId('pad')
  await expect(pad).toBeVisible()
  const frame = await page.locator('#frame').boundingBox()
  const padBox = await pad.boundingBox()
  expect(frame && padBox && padBox.y >= frame.y + frame.height).toBe(true)
  for (const key of ['left', 'right', 'jump']) {
    const box = await page.getByTestId(`pad-${key}`).boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  await page.screenshot({ path: `${shots}/pad-course.png` })

  const cdp = await page.context().newCDPSession(page)
  const left = await centerOf(page.getByTestId('pad-left'))
  const right = await centerOf(page.getByTestId('pad-right'))
  const jump = await centerOf(page.getByTestId('pad-jump'))
  const body = page.locator('body')

  const move: Finger = { id: 1, ...right }
  await touch(cdp, 'touchStart', [move])
  await expect(body).toHaveAttribute('data-pad', 'right')
  await expect(page.getByTestId('pad-right')).toHaveClass(/is-down/)

  // Second thumb jumps while the first keeps walking.
  const hop: Finger = { id: 2, ...jump }
  await touch(cdp, 'touchStart', [move, hop])
  await expect(body).toHaveAttribute('data-pad', 'right jump')
  await page.screenshot({ path: `${shots}/pad-pressed.png` })
  await touch(cdp, 'touchEnd', [hop])
  await expect(body).toHaveAttribute('data-pad', 'right')

  // Sliding across switches direction; sliding off the pad releases.
  await touch(cdp, 'touchMove', [{ ...move, ...left }])
  await expect(body).toHaveAttribute('data-pad', 'left')
  await touch(cdp, 'touchMove', [{ ...move, x: left.x, y: padBox!.y - 40 }])
  await expect(body).toHaveAttribute('data-pad', 'idle')
  await touch(cdp, 'touchMove', [move])
  await expect(body).toHaveAttribute('data-pad', 'right')

  await expect(page.getByTestId('memory-popup')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('prompt')).toBeVisible({ timeout: 25000 })
  await touch(cdp, 'touchEnd', [])
  await expect(body).toHaveAttribute('data-pad', 'idle')
  await page.screenshot({ path: `${shots}/pad-goal.png` })

  // At the pedestal the jump button opens the gift.
  await touch(cdp, 'touchStart', [{ id: 3, ...jump }])
  await touch(cdp, 'touchEnd', [])
  await expect(page.getByTestId('letter')).toBeVisible({ timeout: 10000 })
})
