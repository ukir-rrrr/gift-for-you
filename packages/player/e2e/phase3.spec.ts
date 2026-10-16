import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const SHOTS = 'e2e/screenshots'

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }))

test('plays each course template with its own theme and section names (F3-01)', async ({ page }) => {
  const firstSection = { 'course-01': '出会いの道', 'course-02': '砂浜の道', 'course-03': '森の入口' }
  for (const [template, section] of Object.entries(firstSection)) {
    await page.goto(`/g/demo?template=${template}&easy=1`)
    await page.getByRole('button', { name: 'はじめる' }).click()
    await expect(page.locator('#section')).toHaveText(section)
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${SHOTS}/course-${template}.png` })
  }
})

test('reports a gift with a reason, and points a person in the photo to the removal form (F3-05)', async ({ page }) => {
  await page.goto('/g/demo?e2e=1')
  await page.getByTestId('open-report').first().click()
  await expect(page.getByTestId('report')).toBeVisible()
  await page.getByTestId('report-send').click()
  await expect(page.getByTestId('report-result')).toHaveText('りゆうを選んでください')
  await page.getByTestId('reason-me_in_photo').check()
  await expect(page.locator('#report-removal a')).toHaveAttribute('href', '/legal/removal')
  await page.getByTestId('reason-inappropriate').check()
  await page.locator('#report-detail').fill('写真がいやです')
  const sent = page.waitForRequest((req) => req.url().endsWith('/s/demo/report') && req.method() === 'POST')
  await page.getByTestId('report-send').click()
  expect((await sent).postDataJSON()).toEqual({ reason: 'inappropriate', detail: '写真がいやです' })
  await expect(page.getByTestId('report-result')).toHaveText('受け付けました。ありがとうございます。')
  await page.screenshot({ path: `${SHOTS}/report.png` })
  await page.getByTestId('report-close').click()
  await expect(page.getByTestId('report')).toBeHidden()
  // Terms, privacy, and contact are one tap away.
  await expect(page.locator('#title .links a[href="/legal/terms"]')).toBeVisible()
  await expect(page.locator('#title .links a[href="/support"]')).toBeVisible()
})

test('blocks the sender after a confirm and stops showing the gift (F3-12)', async ({ page }) => {
  await page.goto('/g/demo?e2e=1')
  await page.getByTestId('open-report').first().click()
  await page.getByTestId('block').click()
  await expect(page.getByTestId('block-yes')).toBeVisible()
  const sent = page.waitForRequest((req) => req.url().endsWith('/s/demo/block'))
  await page.getByTestId('block-yes').click()
  expect((await sent).postDataJSON().viewer).toMatch(/^[A-Za-z0-9_-]{22,64}$/)
  await expect(page.getByTestId('error')).toHaveText('ブロックしました。この端末ではこの送り主のギフトは開きません。')
})

test('sends one thank-you stamp after the letter (F3-09)', async ({ page }) => {
  await page.goto('/g/demo?e2e=1')
  await page.getByRole('button', { name: 'はじめる' }).click()
  await expect(page.getByTestId('prompt')).toBeVisible({ timeout: 20000 })
  await page.getByTestId('prompt').click()
  await expect(page.getByTestId('letter')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('thanks')).toBeHidden()
  await page.locator('#letter-body').click()
  await expect(page.getByTestId('thanks')).toBeVisible()
  await page.getByTestId('stamp-love').click()
  await expect(page.getByTestId('thanks-done')).toHaveText('「だいすき」を送りました')
  await expect(page.getByTestId('stamp-thanks')).toBeDisabled()
  await page.screenshot({ path: `${SHOTS}/thanks.png` })
})
