import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const sample = (name: string) => JSON.parse(readFileSync(new URL(`../../catalog/samples/${name}`, import.meta.url), 'utf8'))
const SAMPLE_SHARES = { demo: sample('demo.share.json') }
const SAMPLE_REVEALS = { demo: sample('demo.reveal.json') }

// 1x1 JPEG.
const PHOTO =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

async function openPreview(page: Page, extra: Record<string, unknown> = {}) {
  const beacons: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/events')) beacons.push(req.url())
  })
  await page.addInitScript((payload) => {
    ;(window as unknown as { __GFY_PREVIEW__: unknown }).__GFY_PREVIEW__ = payload
  }, { share: SAMPLE_SHARES.demo, reveal: SAMPLE_REVEALS.demo, photos: { 'photo-1': PHOTO }, ...extra })
  await page.goto('/preview?e2e=1')
  await expect(page.getByTestId('title')).toHaveText('彩へ、ちょっとした冒険を')
  await expect(page.locator('#watermark')).toHaveText('プレビュー')
  await page.getByRole('button', { name: 'はじめる' }).click()
  await expect(page.getByTestId('memory-popup')).toBeVisible()
  await expect(page.getByTestId('memory-photo')).toHaveAttribute('src', PHOTO)
  await expect(page.getByTestId('prompt')).toBeVisible({ timeout: 20000 })
  await page.getByTestId('prompt').click()
  await expect(page.getByTestId('letter')).toHaveAttribute('data-typed', '1', { timeout: 15000 })
  return beacons
}

test('preview plays the local gift, sends no beacons, and never opens the e-gift', async ({ page }) => {
  const beacons = await openPreview(page)
  await page.getByRole('button', { name: 'eギフトを受け取る' }).click()
  await expect(page.locator('#confirm-domain')).toHaveText('giftee.com')
  const go = page.locator('#confirm-go')
  await expect(go).toHaveText('プレビューでは開きません')
  await expect(go).not.toHaveAttribute('href', /.+/)
  expect(beacons).toEqual([])
})

test('preview asks for the passphrase before showing the e-gift', async ({ page }) => {
  await openPreview(page, { passphrase: 'ひみつ' })
  await expect(page.getByTestId('unlock')).toBeVisible()
  await expect(page.locator('#btn-egift')).toBeHidden()
  await page.locator('#unlock-input').fill('ちがう')
  await page.getByRole('button', { name: 'ひらく' }).click()
  await expect(page.locator('#unlock-error')).toHaveText('合言葉がちがうみたい')
  await page.locator('#unlock-input').fill('ひみつ')
  await page.getByRole('button', { name: 'ひらく' }).click()
  await expect(page.getByTestId('unlock')).toBeHidden()
  await expect(page.locator('#btn-egift')).toBeVisible()
})

test('a malformed preview payload shows the shared error', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __GFY_PREVIEW__: unknown }).__GFY_PREVIEW__ = { share: {}, reveal: {} }
  })
  await page.goto('/preview')
  await expect(page.getByTestId('error')).toBeVisible()
})
