import { REPORT_DETAIL_MAX } from '@gfy/schema'
import { htmlEscape } from './http'

/**
 * F3-05 / F3-12: terms, privacy policy, 特定商取引法に基づく表記, support, and the removal request form.
 * Every page is a DRAFT for riku and a legal reviewer to finish. 【…】 marks a placeholder.
 */

export type LegalPage = 'terms' | 'privacy' | 'tokushoho' | 'support' | 'removal'

export const LEGAL_PATHS: Record<LegalPage, string> = {
  terms: '/legal/terms',
  privacy: '/legal/privacy',
  tokushoho: '/legal/tokushoho',
  support: '/support',
  removal: '/legal/removal',
}

const TITLES: Record<LegalPage, string> = {
  terms: '利用規約',
  privacy: 'プライバシーポリシー',
  tokushoho: '特定商取引法に基づく表記',
  support: 'サポート・お問い合わせ',
  removal: '写真に写っている方からの削除依頼',
}

const DRAFT = '<p class="draft" data-testid="draft-banner">この文面はドラフトです。公開前に事業者情報を記入し、専門家の確認を受けてください。【 】は未記入の項目です。</p>'

function contact(email: string | undefined): string {
  return email ? `<a href="mailto:${htmlEscape(email)}">${htmlEscape(email)}</a>` : '【問い合わせ用メールアドレス】'
}

function layout(page: LegalPage, body: string): string {
  const nav = (Object.keys(LEGAL_PATHS) as LegalPage[])
    .map((key) => `<a href="${LEGAL_PATHS[key]}"${key === page ? ' aria-current="page"' : ''}>${TITLES[key]}</a>`)
    .join(' ・ ')
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${TITLES[page]} | gift-for-you</title>
<style>
body { font-family: system-ui, sans-serif; background: #f4ecdf; color: #1a1614; margin: 0; padding: 24px 16px 48px; line-height: 1.7; }
main { max-width: 680px; margin: 0 auto; }
h1 { font-size: 22px; } h2 { font-size: 17px; margin-top: 28px; }
.draft { background: #fff3d6; border-left: 4px solid #8a5a12; padding: 8px 12px; }
nav { font-size: 13px; margin-bottom: 16px; } nav a { color: #4a6580; }
table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #c9b89c; padding: 8px; text-align: left; vertical-align: top; }
th { width: 30%; background: #fffaf2; }
form { display: flex; flex-direction: column; gap: 8px; } label { font-weight: 700; }
input, select, textarea { font: inherit; padding: 8px; border: 1px solid #c9b89c; border-radius: 6px; background: #fffaf2; }
button { font: inherit; padding: 12px; background: #6b3030; color: #fff; border: 0; border-radius: 8px; }
.notice { background: #fffaf2; border-left: 4px solid #3d6b3a; padding: 8px 12px; }
</style>
</head>
<body>
<main data-testid="legal-${page}">
<nav>${nav}</nav>
<h1>${TITLES[page]}</h1>
${DRAFT}
${body}
</main>
</body>
</html>`
}

function terms(email: string | undefined): string {
  return `
<p>この規約は、【事業者名】（以下「当方」）が提供する「gift-for-you」（アプリおよびギフトのリンク先ページ。以下「本サービス」）の利用条件を定めます。</p>
<h2>1. 本サービスの内容</h2>
<p>本サービスは、利用者（以下「贈る人」）が写真・メッセージ・手紙・eギフトのURLやコードを組み合わせた短いゲーム形式のギフトを作り、リンクで相手（以下「受け取る人」）に届けるものです。</p>
<h2>2. 料金</h2>
<p>ギフトの公開には、アプリ内課金（消耗型）でギフト1件ごとの料金がかかります。スタンダード（480円・税込、リンク有効期間14日）とロング（980円・税込、リンク有効期間30日）があります。決済はApple または Google が行います。</p>
<h2>3. 有効期限と削除</h2>
<p>ギフトのリンクは有効期限を過ぎると開けなくなり、写真と文章はサーバーから自動で削除されます。贈る人はいつでもギフトを失効でき、失効した時点で同じく削除されます。</p>
<h2>4. 禁止事項</h2>
<ul>
<li>本人の同意なく他人が写った写真、他人の権利を侵害する写真や文章を使うこと</li>
<li>性的・暴力的な表現、差別、いやがらせ、つきまとい、脅迫にあたる内容</li>
<li>詐欺、フィッシング、不正なサイトへの誘導、eギフトを装った金銭の要求</li>
<li>本サービスの運営を妨げる行為、不正アクセス、リバースエンジニアリング</li>
<li>法令または公序良俗に反する行為</li>
</ul>
<h2>5. 審査・通報・非公開</h2>
<p>写真と文章は公開前に自動でチェックし、基準を満たさないものは公開できません。受け取る人などからの通報が一定数に達したギフトや、写っている方から削除依頼のあったギフトは、確認が終わるまで自動的に非公開になります。当方は、禁止事項にあたると判断したギフトを予告なく非公開・削除できます。</p>
<h2>6. ブロック</h2>
<p>受け取る人は、ギフトの画面から贈る人をブロックできます。ブロックすると、その端末ではその贈る人からのギフトが開かなくなります。</p>
<h2>7. 返金</h2>
<p>アプリ内課金の返金は、Apple または Google の定める手続きによります。当方の都合でギフトを公開できなかった場合は、【返金・再発行の方針】に従って対応します。</p>
<h2>8. アカウントと削除</h2>
<p>本サービスは匿名の端末キーで利用でき、任意でApple / Googleのサインインを連携できます。アプリの「アカウントとデータ」からいつでもアカウントを削除でき、削除すると作成履歴、公開中のギフト、端末キー、サインイン連携が消えます。</p>
<h2>9. 免責</h2>
<p>eギフトは第三者のサービスです。その内容・有効性について当方は責任を負いません。当方は、当方に故意または重大な過失がある場合を除き、本サービスの利用によって生じた損害について責任を負いません。</p>
<h2>10. 年齢</h2>
<p>本サービスは13歳以上を対象とします。未成年の方は保護者の同意を得て利用してください。</p>
<h2>11. 規約の変更・準拠法</h2>
<p>当方は必要に応じて本規約を変更でき、変更後の規約は本ページに掲示した時点から効力を持ちます。本規約は日本法に準拠し、紛争は【管轄裁判所】を第一審の専属的合意管轄裁判所とします。</p>
<h2>お問い合わせ</h2>
<p>${contact(email)}</p>
<p>制定日：【YYYY年MM月DD日】</p>`
}

function privacy(email: string | undefined): string {
  return `
<p>【事業者名】（以下「当方」）は、「gift-for-you」で扱う情報を次のとおり取り扱います。</p>
<h2>1. 取得する情報</h2>
<table>
<tr><th>贈る人が入力するもの</th><td>写真（端末で縮小し、位置情報などのExifを削除してから送信）、思い出の一言、名前（表示名）、プレゼント名、手紙、eギフトのURLまたはコード、合言葉（ハッシュ化して保存）</td></tr>
<tr><th>端末の識別</th><td>アプリが作る匿名の端末キー（サーバーにはハッシュのみ保存）、プッシュ通知用トークン</td></tr>
<tr><th>サインイン連携（任意）</th><td>Apple / Google が発行する利用者識別子（ハッシュのみ保存。メールアドレスや氏名は保存しません）</td></tr>
<tr><th>購入</th><td>ストアの取引ID、商品、購入日時（決済情報はApple / Google と RevenueCat が扱い、当方はカード情報を受け取りません）</td></tr>
<tr><th>受け取る人の操作</th><td>開封・ゴール到達・ありがとうスタンプの有無と日時、通報・ブロックの内容（IPアドレスはハッシュ化して保存）</td></tr>
<tr><th>利用状況</th><td>個人を特定しない集計用イベント（例：ギフト作成数、公開数）</td></tr>
</table>
<h2>2. 利用目的</h2>
<ul><li>ギフトの作成・公開・表示、開封などのお知らせ</li><li>不適切な内容の検出、通報への対応、不正利用の防止</li><li>購入の確認</li><li>サービスの改善（集計データのみ）</li><li>お問い合わせへの対応</li></ul>
<h2>3. 外部サービス（委託先）</h2>
<table>
<tr><th>Cloudflare, Inc.</th><td>サーバー・データベース・写真の保存</td></tr>
<tr><th>Google LLC（Cloud Vision API）</th><td>写真の安全性チェック（判定のために写真を送信します。【Google Cloud のデータ保持条件を確認して記入】）</td></tr>
<tr><th>RevenueCat, Inc.</th><td>購入の確認</td></tr>
<tr><th>Apple Inc. / Google LLC</th><td>決済、サインイン、プッシュ通知の配信</td></tr>
<tr><th>Expo（650 Industries, Inc.）</th><td>プッシュ通知の中継</td></tr>
</table>
<p>これらの事業者は日本国外（主に米国）にあり、各社のプライバシーポリシーに従って情報を取り扱います。【外国にある第三者への提供に関する情報（個人情報保護法第28条）を記入】</p>
<h2>4. 保存期間</h2>
<p>ギフトの写真と文章は、有効期限（14日または30日）を過ぎたとき、または失効・削除したときにサーバーから削除します。ギフトの記録（開封の有無など）は終了から30日後に削除します。公開しなかった下書きは2日後に削除します。集計用イベントは最長400日保存します。</p>
<h2>5. 第三者提供</h2>
<p>法令に基づく場合を除き、本人の同意なく第三者に提供しません。</p>
<h2>6. 削除・開示の請求</h2>
<p>アプリの「アカウントとデータ」からアカウントと関連データを削除できます。写真に写っている方は<a href="${LEGAL_PATHS.removal}">削除依頼フォーム</a>から依頼できます。開示・訂正などのご請求は下記までご連絡ください。</p>
<h2>7. 子どもの情報</h2>
<p>本サービスは13歳未満の方を対象としていません。</p>
<h2>お問い合わせ窓口</h2>
<p>【事業者名】 個人情報取扱責任者：【氏名】<br />連絡先：${contact(email)}</p>
<p>制定日：【YYYY年MM月DD日】</p>`
}

function tokushoho(email: string | undefined): string {
  const rows: [string, string][] = [
    ['販売事業者', '【事業者名】'],
    ['運営統括責任者', '【氏名】'],
    ['所在地', '【所在地】（請求があった場合に遅滞なく開示します、とする場合はその旨）'],
    ['電話番号', '【電話番号】（請求があった場合に遅滞なく開示します、とする場合はその旨）'],
    ['メールアドレス', contact(email)],
    ['販売価格', 'ギフト1件あたり スタンダード 480円（税込）、ロング 980円（税込）。アプリ内の購入画面に表示します。'],
    ['商品代金以外の必要料金', 'インターネット接続にかかる通信料'],
    ['支払方法', 'App Store または Google Play のアプリ内課金'],
    ['支払時期', '購入手続きの完了時（各ストアの規約によります）'],
    ['提供時期', '購入後すぐにギフトのリンクを発行します'],
    ['返品・キャンセル', 'デジタルコンテンツの性質上、購入後の返品・キャンセルはできません。返金は各ストアの手続きによります。'],
    ['動作環境', '【対応OSのバージョン】、ギフトの表示は最新のブラウザ'],
  ]
  return `<table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`
}

function support(email: string | undefined): string {
  return `
<h2>お問い合わせ</h2>
<p>アプリの使い方、購入、ギフトについてのお問い合わせは、下記までご連絡ください。通常【N】営業日以内にお返事します。</p>
<p data-testid="support-contact">${contact(email)}</p>
<h2>よくある質問</h2>
<h3>リンクはいつまで開けますか？</h3>
<p>スタンダードは14日、ロングは30日です。期限が来ると写真と文章は自動で削除されます。</p>
<h3>公開したギフトを取り消したい</h3>
<p>アプリの作成履歴から「失効する」を押すか、公開時に表示された失効コードを失効ページに入力してください。</p>
<h3>購入したのにギフトが公開されない</h3>
<p>アプリを開き直すと、完了していない購入が自動で再処理されます。解決しない場合は、ストアの購入履歴（取引ID）を添えてご連絡ください。</p>
<h3>不適切なギフトを受け取った</h3>
<p>ギフトの画面の「通報」から知らせてください。贈る人をブロックすることもできます。</p>
<h3>自分が写っている写真を消してほしい</h3>
<p><a href="${LEGAL_PATHS.removal}">削除依頼フォーム</a>からご依頼ください。受け付けた時点でそのギフトは非公開になります。</p>
<h3>アカウントを削除したい</h3>
<p>アプリの「アカウントとデータ」→「アカウントを削除」から削除できます。</p>`
}

export type RemovalState = 'form' | 'sent' | 'invalid' | 'busy'

function removal(state: RemovalState): string {
  if (state === 'sent') {
    return '<p class="notice" data-testid="removal-sent">受け付けました。該当のギフトは確認が終わるまで非公開になります。ご連絡先にお返事します。</p>'
  }
  const error =
    state === 'invalid'
      ? '<p class="draft" data-testid="removal-invalid">入力を確かめてください（ギフトのURL、連絡先、写っている方との関係が必要です）。</p>'
      : state === 'busy'
        ? '<p class="draft">送信が多すぎます。しばらくしてからお試しください。</p>'
        : ''
  return `
<p>gift-for-you のギフトに、あなた（またはあなたが保護者である方）が同意なく写っている場合は、このフォームから削除を依頼できます。受け付けた時点で、そのギフトは確認が終わるまで自動的に非公開になります。</p>
${error}
<form method="post">
<label for="url">ギフトのURL</label>
<input id="url" name="url" required maxlength="200" placeholder="https://…/g/XXXXXXXXXX" />
<label for="relation">写っている方との関係</label>
<select id="relation" name="relation" required>
<option value="self">本人</option>
<option value="guardian">保護者</option>
<option value="agent">代理人</option>
</select>
<label for="contact">ご連絡先（メールアドレス）</label>
<input id="contact" name="contact" type="email" required maxlength="120" />
<label for="detail">詳しい内容（任意）</label>
<textarea id="detail" name="detail" rows="4" maxlength="${REPORT_DETAIL_MAX}"></textarea>
<button type="submit">削除を依頼する</button>
</form>`
}

export function legalPage(page: LegalPage, email: string | undefined, removalState: RemovalState = 'form'): string {
  switch (page) {
    case 'terms':
      return layout(page, terms(email))
    case 'privacy':
      return layout(page, privacy(email))
    case 'tokushoho':
      return layout(page, tokushoho(email))
    case 'support':
      return layout(page, support(email))
    case 'removal':
      return layout(page, removal(removalState))
  }
}

export function legalHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  }
}
