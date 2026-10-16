import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const API = 'http://127.0.0.1:8787'
const SHOTS = 'e2e/screenshots'
// The local-only token that `pnpm --filter @gfy/server e2e:serve` starts wrangler with. Not a secret.
const TOKEN = 'local-only-admin-token-not-a-secret-0000'

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }))

/** A published gift made straight through the API, so this file does not depend on the app UI. */
async function publishViaApi(page: Page, request: APIRequestContext) {
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
  const headers = { authorization: `Device ${key}` }
  const { giftId } = await (await request.post(`${API}/api/gifts`, { headers })).json()
  const jpeg = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 240
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#6b3030'
      ctx.fillRect(0, 0, 320, 240)
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
    }),
    'base64',
  )
  expect((await request.put(`${API}/api/gifts/${giftId}/photos/p-1`, { headers: { ...headers, 'content-type': 'image/jpeg' }, data: jpeg })).status()).toBe(200)
  const share = {
    schemaVersion: 1,
    mode: 'platformer',
    catalogVersion: '2026.10.1',
    locale: 'ja',
    from: { displayName: '空' },
    to: { displayName: '海' },
    course: { templateId: 'course-01', difficulty: 'easy', obstaclePresets: ['preset-easy'], assist: { autoAssistAfterFails: 3, easyModeDefault: false } },
    memoryCoins: [{ order: 1, photoRef: 'p-1', message: 'いちまいめ' }],
    goal: { revealEffectId: 'reveal-01', giftItem: { itemId: 'ring', label: '指輪' }, letter: { present: true }, egift: { present: false } },
  }
  expect((await request.put(`${API}/api/gifts/${giftId}/content`, { headers, data: { share, reveal: { letter: { body: 'ありがとう' } } } })).status()).toBe(200)
  await request.post(`${API}/api/gifts/${giftId}/purchase`, { headers, data: { platform: 'sandbox', transactionId: `sandbox-${crypto.randomUUID()}` } })
  const published = await (await request.post(`${API}/api/gifts/${giftId}/publish`, { headers })).json()
  return published.shareId as string
}

test('the admin console logs in, reviews a reported gift, hides and restores it, and manages e-gift domains (F3-07)', async ({ page, request }) => {
  const shareId = await publishViaApi(page, request)
  expect((await request.post(`${API}/s/${shareId}/report`, { data: { reason: 'harassment', detail: 'しつこい' } })).status()).toBe(202)

  await page.goto(`${API}/admin`)
  await expect(page).toHaveURL(`${API}/admin/login`)
  await page.locator('#token').fill('wrong-token')
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByTestId('login-error')).toBeVisible()
  await page.goto(`${API}/admin/login`)
  await page.locator('#token').fill(TOKEN)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
  await expect(page.getByTestId('funnel')).toContainText('gift_published')
  await page.screenshot({ path: `${SHOTS}/p3-06-admin-dashboard.png`, fullPage: true })

  await page.getByRole('link', { name: '通報・非公開' }).click()
  await expect(page.getByTestId(`report-row-${shareId}`)).toContainText('いやがらせ・つきまとい')
  await page.screenshot({ path: `${SHOTS}/p3-07-admin-reports.png`, fullPage: true })
  await page.getByRole('link', { name: shareId }).click()
  await expect(page.getByTestId('gift-state')).toHaveText('公開中')
  await page.getByRole('button', { name: '非公開にする' }).click()
  await expect(page.getByTestId('flash')).toHaveText('非公開にしました')
  await expect(page.getByTestId('gift-state')).toContainText('非公開')
  await page.screenshot({ path: `${SHOTS}/p3-08-admin-gift.png`, fullPage: true })
  expect((await request.get(`${API}/s/${shareId}/share`)).status()).toBe(404)
  await page.getByRole('button', { name: '公開にもどす' }).click()
  expect((await request.get(`${API}/s/${shareId}/share`)).status()).toBe(200)

  await page.getByRole('link', { name: 'eギフト許可ドメイン' }).click()
  await page.getByTestId('domain-input').fill('gift.shop-example.jp')
  await page.getByTestId('domain-add').click()
  await expect(page.getByTestId('domain-gift.shop-example.jp')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/p3-09-admin-domains.png`, fullPage: true })
  const { domains } = await (await request.get(`${API}/s/egift-domains`)).json()
  expect(domains).toContain('gift.shop-example.jp')
})

test('serves the draft legal and support pages and takes a removal request (F3-05)', async ({ page, request }) => {
  for (const [path, heading] of [
    ['/legal/terms', '利用規約'],
    ['/legal/privacy', 'プライバシーポリシー'],
    ['/legal/tokushoho', '特定商取引法に基づく表記'],
    ['/support', 'サポート・お問い合わせ'],
  ]) {
    await page.goto(`${API}${path}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
    await expect(page.getByTestId('draft-banner')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/p3-10-legal-${path.split('/').pop()}.png`, fullPage: true })
  }
  const shareId = await publishViaApi(page, request)
  await page.goto(`${API}/legal/removal`)
  await page.locator('#url').fill(`${API}/g/${shareId}`)
  await page.locator('#contact').fill('me@example.com')
  await page.getByRole('button', { name: '削除を依頼する' }).click()
  await expect(page.getByTestId('removal-sent')).toBeVisible()
  expect((await request.get(`${API}/s/${shareId}/share`)).status()).toBe(404)
})
