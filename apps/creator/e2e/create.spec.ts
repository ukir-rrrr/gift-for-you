import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const API = 'http://127.0.0.1:8787'

/** The navigation stack keeps earlier screens mounted (hidden); only look at the one on top. */
const tid = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true })
const SHOTS = 'e2e/screenshots'

/** A real JPEG from the browser's encoder, larger than 1080px, with an Exif/GPS segment spliced in. */
async function photoWithGps(page: Page, color: string, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    ([fill, w, h]) => {
      const canvas = document.createElement('canvas')
      canvas.width = w as number
      canvas.height = h as number
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = fill as string
      ctx.fillRect(0, 0, w as number, h as number)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect((w as number) / 4, (h as number) / 4, (w as number) / 2, (h as number) / 2)
      return canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
    },
    [color, width, height],
  )
  const jpeg = Buffer.from(base64, 'base64')
  const payload = Buffer.from('Exif\0\0MM\0*GPSLatitude=35.6812;GPSLongitude=139.7671', 'latin1')
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload])
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)])
}

function jpegSize(bytes: Buffer): { width: number; height: number } {
  let at = 2
  while (at < bytes.length) {
    const marker = bytes[at + 1]
    const length = bytes.readUInt16BE(at + 2)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) }
    }
    at += 2 + length
  }
  throw new Error('no frame')
}

async function addPhoto(page: Page, file: Buffer, name: string) {
  const chooser = page.waitForEvent('filechooser')
  await tid(page, 'add-photo').click()
  await (await chooser).setFiles({ name, mimeType: 'image/jpeg', buffer: file })
}

async function next(page: Page) {
  await expect(tid(page, 'next')).toBeEnabled()
  await tid(page, 'next').click()
}

async function fillDraft(page: Page, shots: boolean) {
  await page.goto('/')
  await expect(tid(page, 'home')).toBeVisible()
  if (shots) await page.screenshot({ path: `${SHOTS}/01-home.png` })
  await tid(page, 'create').click()

  // F2-01
  await expect(tid(page, 'step-template')).toBeVisible()
  await expect(tid(page, 'next')).toBeDisabled()
  await tid(page, 'template-course-01').click()
  if (shots) await page.screenshot({ path: `${SHOTS}/02-template.png` })
  await next(page)

  // F2-02
  await tid(page, 'difficulty-normal').click()
  if (shots) await page.screenshot({ path: `${SHOTS}/03-obstacles.png` })
  await next(page)

  // F2-03: three photos, a line each, then reorder.
  const photos = [
    await photoWithGps(page, '#4a6580', 2400, 1600),
    await photoWithGps(page, '#6b3030', 1200, 2000),
    await photoWithGps(page, '#3d6b3a', 800, 600),
  ]
  for (const [i, photo] of photos.entries()) {
    await addPhoto(page, photo, `photo-${i + 1}.jpg`)
    await expect(tid(page, `coin-message-${i}`)).toBeVisible()
  }
  await tid(page, 'coin-message-0').fill('はじめて並んで歩いた日')
  await tid(page, 'coin-message-1').fill('雨の駅前')
  await tid(page, 'coin-message-2').fill('いつものコーヒー')
  await tid(page, 'coin-down-0').click()
  await expect(tid(page, 'coin-message-0')).toHaveValue('雨の駅前')
  await expect(tid(page, 'coin-message-1')).toHaveValue('はじめて並んで歩いた日')
  await expect(tid(page, 'coin-message-0-count')).toHaveText('4/40')
  if (shots) await page.screenshot({ path: `${SHOTS}/04-coins.png`, fullPage: true })
  await next(page)

  // F2-04
  for (const id of ['scarf', 'mug', 'book', 'bouquet', 'pendant']) await expect(tid(page, `item-${id}`)).toBeVisible()
  await tid(page, 'item-mug').click()
  await expect(tid(page, 'item-label')).toHaveValue('マグカップ')
  await tid(page, 'item-label').fill('おそろいのマグカップをふたつ、毎朝つかってね')
  await expect(tid(page, 'item-label')).toHaveValue('おそろいのマグカップをふたつ、毎朝つかっ')
  await tid(page, 'item-label').fill('おそろいのマグ')
  if (shots) await page.screenshot({ path: `${SHOTS}/05-item.png`, fullPage: true })
  await next(page)

  // F2-05 letter
  await tid(page, 'to-name').fill('彩')
  await tid(page, 'from-name').fill('健太')
  await tid(page, 'letter').fill('彩へ。\nいつもとなりを歩いてくれてありがとう。\n健太')
  await expect(tid(page, 'letter-count')).toHaveText('26/500')
  if (shots) await page.screenshot({ path: `${SHOTS}/06-letter.png` })
  await next(page)

  // F2-05 e-gift: http and shorteners are refused, off-list domains need a check, allowlisted ones pass.
  await tid(page, 'egift-url').click()
  await tid(page, 'egift-url-input').fill('http://giftee.com/cards/x')
  await expect(tid(page, 'egift-block')).toHaveText('https:// から始まるURLだけ使えます')
  await expect(tid(page, 'next')).toBeDisabled()
  await tid(page, 'egift-url-input').fill('https://bit.ly/abc')
  await expect(tid(page, 'egift-block')).toContainText('短縮URL')
  await tid(page, 'egift-url-input').fill('https://shop.example.net/card/1')
  await expect(tid(page, 'egift-warn')).toContainText('shop.example.net')
  await expect(tid(page, 'next')).toBeDisabled()
  await tid(page, 'egift-accept').click()
  await expect(tid(page, 'next')).toBeEnabled()
  await tid(page, 'egift-url-input').fill('https://giftee.com/cards/e2e')
  await expect(tid(page, 'egift-ok')).toContainText('giftee.com')
  await tid(page, 'passphrase').fill('ひみつ123')
  if (shots) await page.screenshot({ path: `${SHOTS}/07-egift.png`, fullPage: true })
  await next(page)
}

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }))

test('creates, previews, publishes, and shares a gift end to end', async ({ page, context }) => {
  await fillDraft(page, true)

  // F2-06: the same player bundle, fed the local draft.
  await expect(tid(page, 'player-preview')).toBeVisible()
  const player = page.locator('[data-testid="player-frame"]').filter({ visible: true }).contentFrame()
  await expect(player.getByTestId('title')).toHaveText('彩へ、ちょっとした冒険を', { timeout: 30000 })
  await expect(player.locator('#watermark')).toHaveText('プレビュー')
  await page.screenshot({ path: `${SHOTS}/08-preview.png` })

  // F2-08
  await tid(page, 'to-publish').click()
  await tid(page, 'start-upload').click()
  await expect(tid(page, 'moderation-ok')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('[data-testid="player-frame"]').filter({ visible: true }).contentFrame().getByTestId('title')).toHaveText('彩へ、ちょっとした冒険を', {
    timeout: 30000,
  })
  await page.screenshot({ path: `${SHOTS}/09-moderated.png` })
  await tid(page, 'confirm-preview').click()
  await expect(tid(page, 'purchase')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/10-purchase.png` })
  await tid(page, 'purchase').click()

  await expect(tid(page, 'published')).toBeVisible({ timeout: 30000 })
  const url = (await tid(page, 'share-url').innerText()).trim()
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:8787\/g\/[0-9A-Za-z]{10}$/)
  await expect(tid(page, 'qr')).toBeVisible()
  await expect(tid(page, 'revoke-code')).toHaveText(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
  await expect(tid(page, 'revoke-url')).toHaveText(url.replace('/g/', '/r/'))
  await page.screenshot({ path: `${SHOTS}/11-published.png`, fullPage: true })

  // Share sheet: desktop Chromium has none, so the link is copied instead.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8081' })
  await tid(page, 'share').click()
  await expect(tid(page, 'gift-message')).toHaveText('リンクをコピーしました')

  // What the server holds: 14 days, three photos at most 1080px with no Exif.
  const shareId = url.split('/').pop()!
  const share = await (await page.request.get(`${API}/s/${shareId}/share`)).json()
  expect(Date.parse(share.expiresAt) - Date.now()).toBeGreaterThan(13.9 * 24 * 3600_000)
  expect(Date.parse(share.expiresAt) - Date.now()).toBeLessThanOrEqual(14 * 24 * 3600_000)
  expect(share.memoryCoins.map((coin: { message: string }) => coin.message)).toEqual(['雨の駅前', 'はじめて並んで歩いた日', 'いつものコーヒー'])
  expect(share.goal).toMatchObject({ giftItem: { itemId: 'mug', label: 'おそろいのマグ' }, egift: { kind: 'url', domain: 'giftee.com', passphrase: true } })
  const sizes = []
  for (const coin of share.memoryCoins as { photoRef: string }[]) {
    const res = await page.request.get(`${API}/s/${shareId}/photos/${coin.photoRef}`)
    expect(res.status()).toBe(200)
    const bytes = await res.body()
    expect(bytes.toString('latin1')).not.toContain('GPS')
    expect(bytes.toString('latin1')).not.toContain('Exif')
    sizes.push(jpegSize(bytes))
  }
  expect(sizes).toEqual([
    { width: 648, height: 1080 },
    { width: 1080, height: 720 },
    { width: 800, height: 600 },
  ])

  // F2-09: opening and reaching the goal each push once to the mock notifier.
  for (const type of ['opened', 'opened', 'goal_reached']) {
    await page.request.post(`${API}/s/${shareId}/events`, { data: { type, at: new Date().toISOString() } })
  }
  const pushes = (await (await page.request.get(`${API}/api/_mock/push`)).json()).sent as { body: string }[]
  expect(pushes.map((push) => push.body)).toEqual(['彩さんがギフトを開きました', '彩さんがゴールにたどりつきました'])

  // The recipient's link opens the published gift in the player.
  const recipient = await context.newPage()
  await recipient.goto(url)
  await expect(recipient.getByTestId('title')).toHaveText('彩へ、ちょっとした冒険を')
  await recipient.close()

  // F2-11: history on this device.
  await tid(page, 'go-home').click()
  await tid(page, 'history').click()
  await expect(tid(page, 'history-screen')).toContainText('彩へ')
  await expect(tid(page, 'history-screen')).toContainText('公開中')
  await expect(tid(page, 'history-screen')).toContainText('開封済み')
  await page.screenshot({ path: `${SHOTS}/12-history.png` })

  // F2-10: revoke from the app; the link and photos are gone.
  await tid(page, 'history-screen').getByText('彩へ').click()
  await tid(page, 'revoke').click()
  await tid(page, 'confirm-revoke').click()
  await expect(tid(page, 'gift-revoked')).toBeVisible()
  expect((await page.request.get(`${API}/s/${shareId}/share`)).status()).toBe(404)
  expect((await page.request.get(`${API}/s/${shareId}/photos/${share.memoryCoins[0].photoRef}`)).status()).toBe(404)
})

test('a photo that fails moderation blocks publishing until it is replaced', async ({ page }) => {
  await fillDraft(page, false)
  await tid(page, 'to-publish').click()
  // Make the mock moderator see the second photo as flagged.
  let uploads = 0
  await page.route(`${API}/api/gifts/*/photos/*`, async (route) => {
    uploads += 1
    const ref = route.request().url().split('/').pop()!
    if (uploads === 2) return route.fulfill({ status: 200, json: { ref, status: 'rejected', reason: 'flagged' } })
    return route.fulfill({ response: await route.fetch() })
  })
  await tid(page, 'start-upload').click()
  await expect(tid(page, 'moderation-rejected')).toBeVisible({ timeout: 30000 })
  await expect(tid(page, 'step-publish')).toContainText('2枚目')
  await expect(tid(page, 'purchase')).toHaveCount(0)
  await expect(tid(page, 'confirm-preview')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/13-moderation-rejected.png` })
  await tid(page, 'fix-photos').click()
  await expect(tid(page, 'step-coins')).toContainText('差し替えてください')
})

test('the draft is saved on the device and restored after a reload', async ({ page }) => {
  await page.goto('/')
  await tid(page, 'create').click()
  await tid(page, 'template-course-01').click()
  await next(page)
  await tid(page, 'difficulty-hard').click()
  await next(page)
  await addPhoto(page, await photoWithGps(page, '#4a6580', 1600, 1200), 'a.jpg')
  await tid(page, 'coin-message-0').fill('のこしておく')
  await expect(tid(page, 'autosave')).toHaveText('この端末に自動保存')
  await page.goto('/')
  await expect(tid(page, 'resume')).toBeVisible()
  await tid(page, 'resume').click()
  // Resume opens the first step that still needs something.
  await expect(tid(page, 'step-item')).toBeVisible()
  await page.goto('/create/coins')
  await expect(tid(page, 'coin-message-0')).toHaveValue('のこしておく')
  // The thumbnail comes back from device storage as a JPEG data URL.
  await expect.poll(() => tid(page, 'coin-photo-0').evaluate((el) => el.outerHTML)).toContain('data:image/jpeg;base64,')
})
