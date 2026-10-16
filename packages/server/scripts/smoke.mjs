// Runs one gift through the API of a running `wrangler dev` (real workerd, local D1 and R2).
// Usage: node scripts/smoke.mjs [origin]
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

const origin = process.argv[2] ?? 'http://127.0.0.1:8787'
const key = randomBytes(32).toString('base64url')
const auth = { authorization: `Device ${key}` }

function jpeg() {
  const seg = (m, p) => [0xff, m, (p.length + 2) >> 8, (p.length + 2) & 0xff, ...p]
  const txt = (s) => [...s].map((c) => c.charCodeAt(0))
  return new Uint8Array([
    0xff, 0xd8,
    ...seg(0xe0, [...txt('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...seg(0xe1, [...txt('Exif\0\0GPSLatitude=35.6')]),
    ...seg(0xc0, [8, 0, 100, 0, 100, 1, 1, 0x11, 0]),
    ...seg(0xda, [1, 1, 0, 0, 63, 0]),
    1, 2, 3, 0xff, 0xd9,
  ])
}

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${origin}${path}`, { method, headers: { ...auth, ...headers }, body })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null, raw: text }
}

function check(label, ok, detail) {
  if (!ok) {
    console.error(`FAIL ${label}`, detail ?? '')
    process.exit(1)
  }
  console.log(`ok   ${label}`)
}

const share = JSON.parse(readFileSync(new URL('../../catalog/samples/demo.share.json', import.meta.url), 'utf8'))
share.memoryCoins = [{ order: 1, photoRef: 'p-1', message: 'はじめて' }]

const { body: created } = await call('POST', '/api/gifts')
const gift = created.giftId
check('draft created', typeof gift === 'string')
const up = await call('PUT', `/api/gifts/${gift}/photos/p-1`, jpeg(), { 'content-type': 'image/jpeg' })
check('photo approved', up.body?.status === 'approved', up.raw)
const content = await call('PUT', `/api/gifts/${gift}/content`, JSON.stringify({ share, reveal: { letter: { body: 'こんにちは' } } }), {
  'content-type': 'application/json',
})
check('content stored', content.status === 200, content.raw)
const bought = await call('POST', `/api/gifts/${gift}/purchase`, JSON.stringify({ platform: 'sandbox', transactionId: `sandbox-${randomBytes(6).toString('hex')}` }))
check('sandbox purchase', bought.status === 200, bought.raw)
const pub = await call('POST', `/api/gifts/${gift}/publish`)
check('published', pub.status === 201, pub.raw)
const { shareId, revokeCode } = pub.body
const photo = await fetch(`${origin}/s/${shareId}/photos/p-1`)
const bytes = new Uint8Array(await photo.arrayBuffer())
check('photo served without Exif', photo.status === 200 && !Buffer.from(bytes).toString('latin1').includes('GPS'))
const page = await fetch(`${origin}/g/${shareId}`)
check('player page served', page.status === 200 && (await page.text()).includes('id="stage"'))
const revoke = await fetch(`${origin}/r/${shareId}`, { method: 'POST', body: new URLSearchParams({ code: revokeCode }) })
check('revoked from the web', revoke.status === 200)
const after = await fetch(`${origin}/s/${shareId}/share`)
check('share gone after revoke', after.status === 404)
