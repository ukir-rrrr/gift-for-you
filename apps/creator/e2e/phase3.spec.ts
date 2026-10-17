import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const API = 'http://127.0.0.1:8787'
const SHOTS = 'e2e/screenshots'
const tid = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true })

async function jpeg(page: Page, color: string): Promise<Buffer> {
  const base64 = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, 640, 480)
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
  }, color)
  return Buffer.from(base64, 'base64')
}

async function next(page: Page) {
  await expect(tid(page, 'next')).toBeEnabled()
  await tid(page, 'next').click()
}

/** Template → item → letter, with screenshots of the Phase 3 lists. */
async function makeGift(page: Page, options: { template: string; item: string; shots?: boolean }) {
  await page.goto('/')
  await tid(page, 'create').click()
  for (const id of ['course-01', 'course-02', 'course-03']) await expect(tid(page, `template-${id}`)).toBeVisible()
  await expect(tid(page, 'template-course-02')).toContainText('夕暮れの海')
  await expect(tid(page, 'template-course-03')).toContainText('思い出コイン6枚まで')
  await tid(page, `template-${options.template}`).click()
  if (options.shots) await page.screenshot({ path: `${SHOTS}/p3-01-templates.png`, fullPage: true })
  await next(page)
  await tid(page, 'difficulty-easy').click()
  await next(page)
  const chooser = page.waitForEvent('filechooser')
  await tid(page, 'add-photo').click()
  await (await chooser).setFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await jpeg(page, '#4a6580') })
  await tid(page, 'coin-message-0').fill('海に行った日')
  await next(page)
  // F3-02: twenty items in four groups.
  await expect(page.getByTestId(/^item-/).filter({ visible: true }).and(page.locator('[role="radio"]'))).toHaveCount(20)
  await tid(page, `item-${options.item}`).click()
  if (options.shots) await page.screenshot({ path: `${SHOTS}/p3-02-items.png`, fullPage: true })
  await next(page)
  await tid(page, 'to-name').fill('海')
  await tid(page, 'from-name').fill('空')
  await tid(page, 'letter').fill('いつもありがとう')
  await next(page)
  await tid(page, 'egift-none').click()
  await next(page)
  await tid(page, 'to-publish').click()
  await tid(page, 'start-upload').click()
  await expect(tid(page, 'moderation-ok')).toBeVisible({ timeout: 30000 })
  await tid(page, 'confirm-preview').click()
}

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }))

test('publishes a seaside gift on the ¥980 tier for 30 days, and the recipient can report and thank it', async ({ page, context }) => {
  await makeGift(page, { template: 'course-02', item: 'teddy', shots: true })
  // F3-03: two consumable tiers.
  await expect(tid(page, 'tier-standard')).toContainText('¥480')
  await expect(tid(page, 'tier-premium')).toContainText('¥980')
  await tid(page, 'tier-premium').click()
  await expect(tid(page, 'purchase')).toHaveText('¥980で購入して公開する')
  await page.screenshot({ path: `${SHOTS}/p3-03-purchase.png`, fullPage: true })
  await tid(page, 'purchase').click()
  await expect(tid(page, 'published')).toBeVisible({ timeout: 30000 })
  const url = (await tid(page, 'share-url').innerText()).trim()
  const shareId = url.split('/').pop()!
  const share = await (await page.request.get(`${API}/s/${shareId}/share`)).json()
  const days = (Date.parse(share.expiresAt) - Date.now()) / (24 * 3600_000)
  expect(days).toBeGreaterThan(29.9)
  expect(days).toBeLessThanOrEqual(30)
  expect(share.course.templateId).toBe('course-02')
  expect(share.goal.giftItem.itemId).toBe('teddy')

  // The recipient's page: generic OGP, report sheet against the real server.
  const recipient = await context.newPage()
  await recipient.goto(url)
  await expect(recipient.getByTestId('title')).toHaveText('海へ、ちょっとした冒険を')
  await expect(recipient.locator('meta[property="og:image"]')).toHaveAttribute('content', `${API}/og.png`)
  await expect(recipient.locator('meta[property="og:title"]')).toHaveAttribute('content', '小さな冒険のギフトが届いています')
  await recipient.getByTestId('open-report').first().click()
  await recipient.getByTestId('reason-inappropriate').check()
  await recipient.getByTestId('report-send').click()
  await expect(recipient.getByTestId('report-result')).toHaveText('受け付けました。ありがとうございます。')
  await recipient.close()

  // F3-09: a stamp after the goal shows up in the sender's history.
  await page.request.post(`${API}/s/${shareId}/events`, { data: { type: 'goal_reached' } })
  await page.request.post(`${API}/s/${shareId}/thanks`, { data: { stamp: 'love' } })
  await tid(page, 'go-home').click()
  await tid(page, 'history').click()
  await expect(tid(page, 'history-screen')).toContainText('お返事：「だいすき」')
  await page.screenshot({ path: `${SHOTS}/p3-04-history-thanks.png` })
})

test('a recipient who blocks the sender no longer sees their gifts', async ({ page, context }) => {
  await makeGift(page, { template: 'course-03', item: 'candle' })
  await tid(page, 'purchase').click()
  await expect(tid(page, 'published')).toBeVisible({ timeout: 30000 })
  const url = (await tid(page, 'share-url').innerText()).trim()
  const recipient = await context.newPage()
  await recipient.goto(url)
  await recipient.getByTestId('open-report').first().click()
  await recipient.getByTestId('block').click()
  await recipient.getByTestId('block-yes').click()
  await expect(recipient.getByTestId('error')).toContainText('ブロックしました')
  await recipient.reload()
  await expect(recipient.getByTestId('error')).toHaveText('ブロックした送り主からのギフトなので、ここでは開けません。')
})

test('links a sign-in and deletes the account with every gift and the device key (F3-12)', async ({ page }) => {
  await makeGift(page, { template: 'course-01', item: 'cake' })
  await tid(page, 'purchase').click()
  await expect(tid(page, 'published')).toBeVisible({ timeout: 30000 })
  const shareId = (await tid(page, 'share-url').innerText()).trim().split('/').pop()!
  const keyBefore = await page.evaluate(() => localStorage.getItem('gfy-device-key'))
  await tid(page, 'go-home').click()
  await tid(page, 'account').click()
  await expect(tid(page, 'linked')).toHaveText('まだ連携していません')
  await tid(page, 'link-mock').click()
  await expect(tid(page, 'linked')).toHaveText('連携中：テスト用アカウント')
  await expect(tid(page, 'legal-links')).toContainText('特定商取引法に基づく表記')
  await page.screenshot({ path: `${SHOTS}/p3-05-account.png`, fullPage: true })
  await tid(page, 'delete-account').click()
  await tid(page, 'confirm-delete-account').click()
  await expect(tid(page, 'account-deleted')).toBeVisible()
  expect((await page.request.get(`${API}/s/${shareId}/share`)).status()).toBe(404)
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('gfy')))
  expect(keys.filter((key) => key !== 'gfy-device-key')).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('gfy-device-key'))).not.toBe(keyBefore)
})
