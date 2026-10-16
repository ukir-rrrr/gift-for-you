import { allowedDomains, REPORT_REASONS, tierById, type ShareJson, type RevealJson } from '@gfy/schema'
import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { eventCounts } from './analytics'
import { hmacHex, sha256Hex, timingSafeEqual } from './crypto'
import { clientIp, DAY_MS, htmlEscape, type AdminSession, type AppEnv, type Ctx } from './http'
import { endGift, giftByShareId, hideGift, photoKey, takeAttempt, type GiftRow } from './store'

/**
 * F3-07: a small operator console at /admin. One shared secret (ADMIN_TOKEN, a Worker secret) logs in;
 * the session is an HMAC-signed cookie (HttpOnly, Secure, SameSite=Strict, 8 hours) and every form
 * carries a CSRF token tied to it. Put Cloudflare Access in front in production as a second lock.
 */

const COOKIE = 'gfy_admin'
const SESSION_MS = 8 * 3600_000
const LOGIN_TRIES = { max: 10, windowMs: 3600_000 }
const DOMAIN = /^(?=.{3,100}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

type Session = AdminSession

function adminToken(c: Ctx): string | null {
  const token = c.env.ADMIN_TOKEN ?? ''
  return token.length >= 32 ? token : null
}

async function readSession(c: Ctx): Promise<Session | null> {
  const token = adminToken(c)
  const raw = getCookie(c, COOKIE)
  if (!token || !raw) return null
  const [expText, sig] = raw.split('.')
  const exp = Number(expText)
  if (!Number.isFinite(exp) || exp <= c.get('services').now() || !sig) return null
  if (!timingSafeEqual(sig, await hmacHex(token, `session:${exp}`))) return null
  return { exp, csrf: await hmacHex(token, `csrf:${exp}`) }
}

function headers(c: Ctx) {
  c.header('Cache-Control', 'no-store')
  c.header('X-Robots-Tag', 'noindex, nofollow')
  c.header('X-Frame-Options', 'DENY')
  // same-origin, not no-referrer: with no-referrer the browser posts forms with Origin: null.
  c.header('Referrer-Policy', 'same-origin')
  c.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
}

function page(title: string, body: string, session: Session | null): string {
  const nav = session
    ? `<nav><a href="/admin">ダッシュボード</a> ・ <a href="/admin/reports">通報・非公開</a> ・ <a href="/admin/domains">eギフト許可ドメイン</a>
<form method="post" action="/admin/logout" class="inline"><input type="hidden" name="csrf" value="${session.csrf}" /><button>ログアウト</button></form></nav>`
    : ''
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" /><title>${htmlEscape(title)} | gift-for-you 管理</title>
<style>
body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; background: #f4ecdf; color: #1a1614; }
main { max-width: 960px; margin: 0 auto; } h1 { font-size: 20px; }
nav { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 14px; margin-bottom: 12px; } nav a { color: #4a6580; }
table { border-collapse: collapse; width: 100%; background: #fffaf2; font-size: 14px; } th, td { border: 1px solid #c9b89c; padding: 6px 8px; text-align: left; vertical-align: top; }
.inline { display: inline; } button { font: inherit; padding: 6px 12px; border: 1px solid #6b3030; background: #6b3030; color: #fff; border-radius: 6px; cursor: pointer; }
button.secondary { background: #fff; color: #6b3030; } input { font: inherit; padding: 6px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
.tile { background: #fffaf2; border: 1px solid #c9b89c; border-radius: 8px; padding: 10px; } .tile b { display: block; font-size: 24px; }
.photos img { width: 160px; height: auto; border: 1px solid #c9b89c; margin: 4px; }
.flash { background: #fffaf2; border-left: 4px solid #3d6b3a; padding: 8px; }
</style></head><body><main data-testid="admin">${nav}<h1>${htmlEscape(title)}</h1>${body}</main></body></html>`
}

function fmt(ms: number | null): string {
  return ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : '—'
}

function giftState(gift: GiftRow, now: number): string {
  if (gift.status !== 'published') return gift.status === 'expired' ? '期限切れ' : `終了（${gift.ended_reason ?? gift.status}）`
  if (gift.hidden_at) return `非公開（${gift.hidden_reason ?? ''}）`
  return (gift.expires_at ?? 0) <= now ? '期限切れ（未掃除）' : '公開中'
}

function form(session: Session, action: string, label: string, kind = '', extra = ''): string {
  return `<form method="post" action="${action}" class="inline"><input type="hidden" name="csrf" value="${session.csrf}" />${extra}<button class="${kind}">${label}</button></form>`
}

const REASON_LABEL = new Map<string, string>(REPORT_REASONS.map((reason) => [reason.id, reason.label]))

async function audit(c: Ctx, action: string, target: string) {
  await c.env.DB.prepare('INSERT INTO admin_audit (action, target, at) VALUES (?, ?, ?)').bind(action, target, c.get('services').now()).run()
}

export function adminRoutes() {
  const admin = new Hono<AppEnv>()

  admin.use('*', async (c, next) => {
    headers(c)
    if (!adminToken(c)) return c.html(page('管理画面', '<p>ADMIN_TOKEN が設定されていません。</p>', null), 503)
    if (c.req.method === 'POST') {
      // Same-origin forms only, on top of SameSite=Strict and the CSRF token.
      const origin = c.req.header('origin')
      let sameHost = true
      try {
        sameHost = !origin || new URL(origin).host === (c.req.header('host') ?? new URL(c.req.url).host)
      } catch {
        sameHost = false
      }
      if (!sameHost) return c.text('forbidden', 403)
    }
    await next()
  })

  admin.get('/login', (c) =>
    c.html(
      page(
        'ログイン',
        `<form method="post" action="/admin/login"><label for="token">管理トークン</label>
<input id="token" name="token" type="password" autocomplete="current-password" required /> <button>ログイン</button></form>`,
        null,
      ),
    ),
  )

  admin.post('/login', async (c) => {
    const now = c.get('services').now()
    const ipHash = await sha256Hex(`${c.env.HASH_SALT ?? ''}|admin|${clientIp(c)}`)
    if (!(await takeAttempt(c.env.DB, `admin-login:${ipHash}`, LOGIN_TRIES.max, LOGIN_TRIES.windowMs, now))) {
      return c.html(page('ログイン', '<p>試行が多すぎます。1時間後にもう一度どうぞ。</p>', null), 429)
    }
    const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>)
    const given = typeof body.token === 'string' ? body.token : ''
    const token = adminToken(c)!
    // Compare digests so the length of the secret does not leak through timing.
    if (!timingSafeEqual(await sha256Hex(given), await sha256Hex(token))) {
      return c.html(page('ログイン', '<p data-testid="login-error">トークンがちがいます。</p><p><a href="/admin/login">もどる</a></p>', null), 403)
    }
    const exp = now + SESSION_MS
    setCookie(c, COOKIE, `${exp}.${await hmacHex(token, `session:${exp}`)}`, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/admin',
      maxAge: SESSION_MS / 1000,
    })
    await audit(c, 'login', '')
    return c.redirect('/admin', 303)
  })

  // Everything below needs a session; POSTs also need its CSRF token.
  admin.use('*', async (c, next) => {
    const session = await readSession(c)
    if (!session) return c.redirect('/admin/login', 303)
    if (c.req.method === 'POST') {
      const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>)
      if (typeof body.csrf !== 'string' || !timingSafeEqual(body.csrf, session.csrf)) return c.text('forbidden', 403)
    }
    c.set('adminSession', session)
    await next()
  })

  const sessionOf = (c: Ctx) => c.get('adminSession')

  admin.post('/logout', (c) => {
    deleteCookie(c, COOKIE, { path: '/admin', secure: true })
    return c.redirect('/admin/login', 303)
  })

  admin.get('/', async (c) => {
    const db = c.env.DB
    const now = c.get('services').now()
    const week = await eventCounts(db, now - 7 * DAY_MS)
    const month = await eventCounts(db, now - 30 * DAY_MS)
    const count = async (sql: string, ...args: unknown[]) => (await db.prepare(sql).bind(...args).first<{ n: number }>())?.n ?? 0
    const live = await count("SELECT COUNT(*) AS n FROM gifts WHERE status = 'published' AND hidden_at IS NULL AND expires_at > ?", now)
    const hidden = await count("SELECT COUNT(*) AS n FROM gifts WHERE status = 'published' AND hidden_at IS NOT NULL")
    const openReports = await count("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'")
    const removals = await count("SELECT COUNT(*) AS n FROM removal_requests WHERE status = 'open'")
    const revenue = await db
      .prepare('SELECT product_id, COUNT(*) AS n, SUM(is_sandbox) AS sandbox FROM purchases WHERE refunded_at IS NULL AND created_at >= ? GROUP BY product_id')
      .bind(now - 30 * DAY_MS)
      .all<{ product_id: string; n: number; sandbox: number }>()
    const monthMap = new Map(month.map((row) => [row.name, row.n]))
    const tiles = [
      ['公開中のギフト', live],
      ['非公開中', hidden],
      ['未対応の通報', openReports],
      ['未対応の削除依頼', removals],
    ]
      .map(([label, n]) => `<div class="tile">${label}<b data-testid="tile-${label}">${n}</b></div>`)
      .join('')
    const funnel = ['create_started', 'preview_opened', 'purchase_started', 'gift_published', 'gift_opened', 'goal_reached', 'thanks_sent']
      .map((name) => `<tr><td>${name}</td><td>${week.find((row) => row.name === name)?.n ?? 0}</td><td>${monthMap.get(name) ?? 0}</td></tr>`)
      .join('')
    const others = month
      .filter((row) => !funnel.includes(row.name))
      .map((row) => `<tr><td>${htmlEscape(row.name)}</td><td>${week.find((w) => w.name === row.name)?.n ?? 0}</td><td>${row.n}</td></tr>`)
      .join('')
    const sales = revenue.results
      .map((row) => `<tr><td>${htmlEscape(row.product_id)}</td><td>${row.n}</td><td>${row.sandbox ?? 0}</td></tr>`)
      .join('')
    return c.html(
      page(
        'ダッシュボード',
        `<div class="tiles">${tiles}</div>
<h2>ファネル</h2><table data-testid="funnel"><tr><th>イベント</th><th>7日</th><th>30日</th></tr>${funnel}${others}</table>
<h2>購入（30日）</h2><table><tr><th>商品</th><th>件数</th><th>うちsandbox</th></tr>${sales || '<tr><td colspan="3">なし</td></tr>'}</table>`,
        sessionOf(c),
      ),
    )
  })

  admin.get('/reports', async (c) => {
    const db = c.env.DB
    const now = c.get('services').now()
    const session = sessionOf(c)
    const { results } = await db
      .prepare(
        `SELECT g.*, (SELECT COUNT(*) FROM reports r WHERE r.gift_id = g.id AND r.status = 'open') AS open_reports,
                (SELECT GROUP_CONCAT(DISTINCT r.reason) FROM reports r WHERE r.gift_id = g.id AND r.status = 'open') AS reasons
         FROM gifts g
         WHERE g.share_id IS NOT NULL AND (g.hidden_at IS NOT NULL OR EXISTS (SELECT 1 FROM reports r WHERE r.gift_id = g.id AND r.status = 'open'))
         ORDER BY COALESCE(g.hidden_at, 0) DESC LIMIT 200`,
      )
      .all<GiftRow & { open_reports: number; reasons: string | null }>()
    const rows = results
      .map(
        (gift) => `<tr data-testid="report-row-${gift.share_id}"><td><a href="/admin/gifts/${gift.share_id}">${gift.share_id}</a></td><td>${giftState(gift, now)}</td>
<td>${gift.open_reports}</td><td>${(gift.reasons ?? '').split(',').filter(Boolean).map((r) => htmlEscape(REASON_LABEL.get(r) ?? r)).join('<br />')}</td>
<td>${fmt(gift.hidden_at)}</td></tr>`,
      )
      .join('')
    const removals = await db
      .prepare(
        `SELECT q.*, g.share_id AS live_share FROM removal_requests q LEFT JOIN gifts g ON g.id = q.gift_id
         WHERE q.status = 'open' ORDER BY q.created_at DESC LIMIT 100`,
      )
      .all<{ id: number; share_id: string | null; live_share: string | null; contact: string; relation: string; detail: string | null; created_at: number }>()
    const removalRows = removals.results
      .map(
        (row) => `<tr data-testid="removal-row"><td>${row.live_share ? `<a href="/admin/gifts/${row.live_share}">${row.live_share}</a>` : htmlEscape(row.share_id ?? '不明')}</td>
<td>${htmlEscape(row.relation)}</td><td>${htmlEscape(row.contact)}</td><td>${htmlEscape(row.detail ?? '')}</td><td>${fmt(row.created_at)}</td>
<td>${form(session, `/admin/removals/${row.id}/resolve`, '対応済みにする', 'secondary')}</td></tr>`,
      )
      .join('')
    return c.html(
      page(
        '通報・非公開',
        `<table><tr><th>ギフト</th><th>状態</th><th>未対応の通報</th><th>理由</th><th>非公開にした日時</th></tr>${rows || '<tr><td colspan="5">なし</td></tr>'}</table>
<h2>写っている方からの削除依頼</h2>
<table><tr><th>ギフト</th><th>関係</th><th>連絡先</th><th>内容</th><th>受付</th><th></th></tr>${removalRows || '<tr><td colspan="6">なし</td></tr>'}</table>`,
        session,
      ),
    )
  })

  admin.get('/gifts/:shareId', async (c) => {
    const gift = await giftByShareId(c.env.DB, c.req.param('shareId'))
    if (!gift) return c.html(page('ギフト', '<p>見つかりません。</p>', sessionOf(c)), 404)
    const session = sessionOf(c)
    const now = c.get('services').now()
    const { results: reports } = await c.env.DB
      .prepare('SELECT reason, detail, status, created_at FROM reports WHERE gift_id = ? ORDER BY created_at DESC')
      .bind(gift.id)
      .all<{ reason: string; detail: string | null; status: string; created_at: number }>()
    const share = gift.share_json ? (JSON.parse(gift.share_json) as ShareJson) : null
    const reveal = gift.reveal_json ? (JSON.parse(gift.reveal_json) as RevealJson) : null
    const photos = share
      ? share.memoryCoins
          .map((coin) => `<figure><img src="/admin/gifts/${gift.share_id}/photos/${encodeURIComponent(coin.photoRef)}" alt="" /><figcaption>${htmlEscape(coin.message)}</figcaption></figure>`)
          .join('')
      : '<p>写真と文章は削除済みです。</p>'
    const actions = [
      gift.status === 'published' && !gift.hidden_at ? form(session, `/admin/gifts/${gift.share_id}/hide`, '非公開にする') : '',
      gift.status === 'published' && gift.hidden_at ? form(session, `/admin/gifts/${gift.share_id}/unhide`, '公開にもどす', 'secondary') : '',
      gift.status === 'published' ? form(session, `/admin/gifts/${gift.share_id}/end`, '削除する（写真も消えます）') : '',
      reports.some((r) => r.status === 'open') ? form(session, `/admin/gifts/${gift.share_id}/resolve`, '通報を対応済みにする', 'secondary') : '',
    ].join(' ')
    const flash = c.req.query('done') ? `<p class="flash" data-testid="flash">${htmlEscape(c.req.query('done') ?? '')}</p>` : ''
    return c.html(
      page(
        `ギフト ${gift.share_id}`,
        `${flash}<table>
<tr><th>状態</th><td data-testid="gift-state">${giftState(gift, now)}</td></tr>
<tr><th>プラン</th><td>${htmlEscape(tierById(gift.tier ?? '')?.name ?? gift.tier ?? '—')}</td></tr>
<tr><th>公開 / 期限</th><td>${fmt(gift.published_at)} / ${fmt(gift.expires_at)}</td></tr>
<tr><th>開封 / ゴール</th><td>${gift.opened_count} / ${gift.goal_count}</td></tr>
</table>
<p>${actions}</p>
<h2>通報</h2><table><tr><th>理由</th><th>内容</th><th>状態</th><th>日時</th></tr>${
          reports
            .map((r) => `<tr><td>${htmlEscape(REASON_LABEL.get(r.reason) ?? r.reason)}</td><td>${htmlEscape(r.detail ?? '')}</td><td>${r.status}</td><td>${fmt(r.created_at)}</td></tr>`)
            .join('') || '<tr><td colspan="4">なし</td></tr>'
        }</table>
<h2>内容</h2>
${share ? `<p>${htmlEscape(share.from.displayName)} → ${htmlEscape(share.to.displayName)}・${htmlEscape(share.goal.giftItem.label)}</p>` : ''}
<div class="photos">${photos}</div>
${reveal ? `<h3>手紙</h3><pre style="white-space: pre-wrap">${htmlEscape(reveal.letter.body)}</pre>` : ''}
${reveal?.egift?.url ? `<p>eギフト：${htmlEscape(reveal.egift.url)}</p>` : ''}`,
        session,
      ),
    )
  })

  admin.get('/gifts/:shareId/photos/:ref', async (c) => {
    const gift = await giftByShareId(c.env.DB, c.req.param('shareId'))
    if (!gift) return c.text('not found', 404)
    const object = await c.env.PHOTOS.get(photoKey(gift.id, c.req.param('ref')))
    if (!object) return c.text('not found', 404)
    return c.body(object.body as ReadableStream, 200, { 'content-type': 'image/jpeg', 'x-content-type-options': 'nosniff' })
  })

  const act = (name: string, run: (c: Ctx, gift: GiftRow, now: number) => Promise<string>) =>
    admin.post(`/gifts/:shareId/${name}`, async (c) => {
      const gift = await giftByShareId(c.env.DB, c.req.param('shareId'))
      if (!gift) return c.text('not found', 404)
      const message = await run(c, gift, c.get('services').now())
      await audit(c, name, gift.share_id ?? gift.id)
      return c.redirect(`/admin/gifts/${gift.share_id}?done=${encodeURIComponent(message)}`, 303)
    })

  act('hide', async (c, gift, now) => ((await hideGift(c.env.DB, gift.id, 'operator', now)) ? '非公開にしました' : '変更なし'))
  act('unhide', async (c, gift) => {
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE gifts SET hidden_at = NULL, hidden_reason = NULL WHERE id = ?').bind(gift.id),
      c.env.DB.prepare("UPDATE reports SET status = 'resolved' WHERE gift_id = ?").bind(gift.id),
    ])
    return '公開にもどしました'
  })
  act('end', async (c, gift, now) => {
    if (gift.status === 'published') await endGift(c.env.DB, c.env.PHOTOS, gift, 'operator', now)
    await c.env.DB.prepare("UPDATE reports SET status = 'resolved' WHERE gift_id = ?").bind(gift.id).run()
    return '削除しました'
  })
  act('resolve', async (c, gift) => {
    await c.env.DB.prepare("UPDATE reports SET status = 'resolved' WHERE gift_id = ?").bind(gift.id).run()
    return '通報を対応済みにしました'
  })

  admin.post('/removals/:id/resolve', async (c) => {
    await c.env.DB.prepare("UPDATE removal_requests SET status = 'resolved', resolved_at = ? WHERE id = ?")
      .bind(c.get('services').now(), Number(c.req.param('id')))
      .run()
    await audit(c, 'removal_resolve', c.req.param('id'))
    return c.redirect('/admin/reports', 303)
  })

  admin.get('/domains', async (c) => {
    const session = sessionOf(c)
    const { results } = await c.env.DB.prepare('SELECT domain, note, added_at FROM egift_domains ORDER BY domain').all<{ domain: string; note: string | null; added_at: number }>()
    const builtIn = allowedDomains()
      .map((domain) => `<tr><td>${domain}</td><td>組み込み</td><td></td></tr>`)
      .join('')
    const added = results
      .map(
        (row) => `<tr data-testid="domain-${row.domain}"><td>${htmlEscape(row.domain)}</td><td>${htmlEscape(row.note ?? '')}（${fmt(row.added_at)}）</td>
<td>${form(session, '/admin/domains/delete', '外す', 'secondary', `<input type="hidden" name="domain" value="${htmlEscape(row.domain)}" />`)}</td></tr>`,
      )
      .join('')
    const error = c.req.query('error') ? '<p class="flash">ドメインの形式がちがいます（例：gift.example.com）。</p>' : ''
    return c.html(
      page(
        'eギフト許可ドメイン',
        `<p>許可リストのドメインは、受け取る人の確認画面で警告なしに開けます。リストにないドメインは警告つきになります。短縮URLと http は常にブロックします。</p>${error}
<form method="post" action="/admin/domains"><input type="hidden" name="csrf" value="${session.csrf}" />
<input name="domain" placeholder="gift.example.com" required data-testid="domain-input" /> <input name="note" placeholder="メモ（任意）" maxlength="80" /> <button data-testid="domain-add">追加</button></form>
<table><tr><th>ドメイン</th><th>種類</th><th></th></tr>${builtIn}${added}</table>`,
        session,
      ),
    )
  })

  admin.post('/domains', async (c) => {
    const body = await c.req.parseBody()
    const domain = String(body.domain ?? '')
      .trim()
      .toLowerCase()
      .replace(/^www\./, '')
    if (!DOMAIN.test(domain)) return c.redirect('/admin/domains?error=1', 303)
    const note = String(body.note ?? '').slice(0, 80)
    await c.env.DB.prepare('INSERT OR REPLACE INTO egift_domains (domain, note, added_at) VALUES (?, ?, ?)')
      .bind(domain, note || null, c.get('services').now())
      .run()
    await audit(c, 'domain_add', domain)
    return c.redirect('/admin/domains', 303)
  })

  admin.post('/domains/delete', async (c) => {
    const body = await c.req.parseBody()
    const domain = String(body.domain ?? '')
    await c.env.DB.prepare('DELETE FROM egift_domains WHERE domain = ?').bind(domain).run()
    await audit(c, 'domain_remove', domain)
    return c.redirect('/admin/domains', 303)
  })

  return admin
}

/** Operator-added e-gift domains, used on top of the built-in allowlist. */
export async function extraDomains(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare('SELECT domain FROM egift_domains ORDER BY domain').all<{ domain: string }>()
  return results.map((row) => row.domain)
}
