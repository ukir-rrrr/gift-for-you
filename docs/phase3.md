# Phase 3: フル MVP

Phase 2（作成アプリ + Worker）に、テンプレート3本・アイテム20種・本番課金・写真モデレーション・通報/削除・有効期限・分析と管理画面・ストア審査対応を足したもの。外部サービスは本番用の実装を書いたうえで環境変数で切り替え、テストはモックとフェイク fetch で通している。**本番のアカウント・鍵・デプロイ・ストア提出はまだ何もしていない。** 必要な作業は末尾の「riku がやること」にまとめた。

## 要件と実装

| 要件 | 実装 | 主なファイル |
| --- | --- | --- |
| F3-01 テンプレート3本 | コースをデータ（`CourseDef`：9区画・3セクション・8障害物スロット・コイン位置・ゴール前の段差）で定義し、1つのビルダーで組み立てる。course-01「はじまりの丘」（Phase 1 と同一）、course-02「夕暮れの海辺」（海の帯と夕焼け）、course-03「星降る夜の森」（夜空と星）。テーマは既存の背景素材に重ねる色面・帯・星で表現（新しい PNG なし）。プレイヤーは Share JSON の `templateId` のコースを遊ぶ（Phase 2 までは常に course-01 だった）。 | `packages/catalog/src/course.ts`, `templates.ts`, `packages/player/src/scene.ts` |
| F3-01 クリア検証 | 3コース×やさしい/ふつう/むずかしい の9本のリプレイテープ（`packages/player/test/tapes`）。全部ミスなし・全コイン取得・約112秒（100〜130秒の範囲を検証）。CI はボットでテープを録り直し、コミット済みと一致することも確認する。 | `scripts/record-clears.ts`, `test/sim.test.ts` |
| F3-02 アイテム約20種 | 20種・4カテゴリ（身につけるもの/暮らしのもの/おいしいもの/趣味のもの）。新しい15種は 28色パレットの文字マップから生成（パレット外の色は生成時にエラー）。 | `packages/catalog/src/gifts.ts`, `packages/player/scripts/item-sprites.ts` |
| F3-03 本番課金 | 消耗型 IAP 2段階：スタンダード ¥480（14日）`gfy_gift_standard`、ロング ¥980（30日）`gfy_gift_premium`。アプリは RevenueCat SDK（`EXPO_PUBLIC_STORE=revenuecat`）、Web/e2e は Sandbox。RevenueCat の app user id は `gfy_` + 端末キーの SHA-256 で、サーバーは同じ値を自分で計算して、その人の取引かを RevenueCat REST API（`GET /v1/subscribers/{id}`、シークレットキー）で検証する。1取引は1ギフトにしか使えない。 | `packages/schema/src/tiers.ts`, `packages/server/src/services/purchase.ts`, `apps/creator/src/native/revenuecat.ts` |
| F3-03 未完了取引の再処理 | 消耗型は復元できないので、①購入直後に取引をローカルに保存し、サーバーが受け取ったら消す ②起動時に残っている取引を再送 ③ストアが知っている取引（`nonSubscriptionTransactions`）を `POST /api/purchases` で未使用クレジットとして登録 ④RevenueCat webhook（`NON_RENEWING_PURCHASE`）でもクレジットを記録。購入画面は未使用クレジットがあれば「購入済みの分で公開する」を出す。返金（`CANCELLATION`）は記録し、管理画面の売上から除く。 | `apps/creator/src/lib/purchases.ts`, `POST /webhooks/revenuecat` |
| F3-04 写真モデレーション | `MODERATION=vision`：Cloud Vision SafeSearch（adult は POSSIBLE 以上、violence・racy は LIKELY 以上で不可）。API キーはヘッダーで送る。API が答えないときは承認せず 503（写真も保存しない）。文章は語句リスト（全角半角・空白を無視）。不可の写真があるギフトは公開できない（Phase 2 から）。 | `packages/server/src/services/moderation.ts` |
| F3-05 通報・削除 | プレイヤーのタイトルと手紙画面に「通報・ブロック」。理由5種＋任意の詳細。通報者は IP のソルト付きハッシュで数え、異なる通報者が `REPORT_HIDE_THRESHOLD`（既定3）に達すると自動で仮非公開（相手には 404 と同じ表示、送り主の履歴には「確認中」）。写っている本人・保護者からの削除依頼は `/legal/removal`、受付時点で仮非公開。規約・プライバシーポリシー・特商法表記・サポートページは Worker が配信（**ドラフト**、【 】がプレースホルダ）。 | `packages/server/src/legal.ts`, `packages/player/src/safety.ts` |
| F3-06 有効期限と自動削除 | 期限はプランで決まる（14日/30日）。毎時の cron が期限切れを終了し（写真を R2 から、文章を D1 から削除）、終了したギフトの残りの行は30日後に完全削除。未公開の下書きは2日、分析イベントは400日、対応済みの通報は180日。 | `packages/server/src/store.ts` (`sweep`, `RETENTION`) |
| F3-07 分析と管理画面 | イベントは閉じたリスト（名前、テンプレートや理由などの列挙値・数値のみ。名前・文章・URL・共有ID は入れない）。`/admin`：`ADMIN_TOKEN` でログイン、HMAC 署名の Cookie（HttpOnly/Secure/SameSite=Strict、8時間）、フォームごとの CSRF トークン、同一オリジン確認、ログイン試行制限、操作ログ。ダッシュボード（ファネル・購入）、通報・削除依頼一覧、ギフト詳細（写真と文章を確認）、非公開/公開に戻す/削除、eギフト許可ドメインの追加・削除（プレイヤーの確認画面と作成アプリが `/s/egift-domains` を読む）。 | `packages/server/src/admin.ts`, `analytics.ts` |
| F3-08 OGP（Should） | 全ギフト共通の汎用画像 `og.png`（1200×630、パレット内）と固定の og:title。名前・写真・メッセージは入らない。Worker が `/g/*` で og:image を絶対 URL にする。 | `packages/player/index.html`, `scripts/generate-art.ts` |
| F3-09 ありがとう（Could） | 手紙を読み終えると4つのスタンプ。1ギフト1回、送り主にプッシュ、作成履歴に表示。 | `POST /s/{id}/thanks` |
| F3-11 カートレース（Won't） | `GAME_MODES` レジストリと `GameMode` インターフェースが拡張点。実装なし。 | `packages/catalog/src/modes.ts` |
| F3-12 ストア審査 | アプリ内「アカウントとデータ」：Sign in with Apple 連携（任意、他端末と履歴を共有）、アカウント削除（全ギフト終了・写真削除・履歴・端末キー・サインイン連携・端末内データを消す）。UGC：フィルタ（F3-04）、通報（F3-05）、送り主のブロック（閲覧者ごとのランダムキー、以後その送り主のギフトは開かない）、連絡先公開（サポートページ）。申告の下書きは [store-privacy.md](store-privacy.md) と [store-ugc-age.md](store-ugc-age.md)。 | `apps/creator/app/account.tsx`, `POST /s/{id}/block` |

## API（Phase 3 で追加）

| route | |
| --- | --- |
| `GET /api/purchases/unclaimed` | この端末の未使用クレジット |
| `POST /api/purchases` | ストア取引をクレジットとして登録（`{platform, transactionId, productId}`） |
| `POST /api/gifts/{id}/purchase` | `productId` 追加。既に記録済みの取引（webhook/同期）は再検証せずに使う。`{ok, tier}` |
| `GET /api/account`, `POST /api/account/link`, `DELETE /api/account` | サインイン連携とアカウント削除 |
| `POST /api/analytics` | アプリのファネルイベント（許可リストのみ） |
| `POST /webhooks/revenuecat` | `Authorization` が `REVENUECAT_WEBHOOK_AUTH` と一致するときだけ受ける。イベント ID で重複排除 |
| `GET /s/egift-domains` | 組み込み + 管理画面で追加したドメイン |
| `POST /s/{id}/report`, `/block`, `/thanks` | 通報、ブロック（`{viewer}`）、スタンプ |
| `GET /s/{id}/share` | `X-Gfy-Viewer` がブロック済みの送り主なら 403 `blocked` |
| `/legal/terms`, `/legal/privacy`, `/legal/tokushoho`, `/support`, `/legal/removal` | 規約類（ドラフト）と削除依頼フォーム |
| `/admin/*` | 管理画面 |

## プロバイダの切り替え

`wrangler.jsonc` の既定は全部 `none`（失敗側に倒れる：必要なリクエストだけ 503）。ローカルと e2e は `pnpm --filter @gfy/server dev` / `e2e:serve` が `--var` でモックに切り替える（e2e 用の `ADMIN_TOKEN` はローカル専用の固定文字列で、秘密ではない）。

| var | 本番値 | 必要な secret | モック |
| --- | --- | --- | --- |
| `MODERATION` | `vision` | `GOOGLE_VISION_API_KEY` | `mock`：`GFY-NG` を含む画像・`NGWORD` を含む文章を不可 |
| `PURCHASE` | `revenuecat` | `REVENUECAT_SECRET_KEY`、`REVENUECAT_WEBHOOK_AUTH` | `sandbox-mock`：`sandbox-…` の取引を受理 |
| `NOTIFIER` | `expo` | （任意）`EXPO_ACCESS_TOKEN` | `mock`：D1 の outbox に書く |
| `SIGNIN` | `oidc` | なし（`APPLE_AUDIENCE` / `GOOGLE_AUDIENCES` は var） | `mock`：`mock:<subject>` |
| 管理画面 | — | `ADMIN_TOKEN`（32文字以上） | — |
| ハッシュ | — | `HASH_SALT` | — |

アプリ側（EAS のビルド環境変数）：`EXPO_PUBLIC_API_ORIGIN`、`EXPO_PUBLIC_STORE=revenuecat`、`EXPO_PUBLIC_REVENUECAT_IOS_KEY`、`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`。e2e は `EXPO_PUBLIC_PUSH_MOCK=1`、`EXPO_PUBLIC_SIGNIN_MOCK=1`。

## チェック

```
pnpm build && pnpm test && pnpm lint && pnpm typecheck
pnpm --filter @gfy/player record-clears && git diff --exit-code packages/player/test/tapes   # リプレイ
pnpm e2e            # プレイヤー（3コース、通報、ブロック、ありがとう を追加）
pnpm e2e:creator    # 作成アプリ + 管理画面 + 規約ページ（wrangler dev 上）
node scripts/check-secrets.mjs
```

CI（`.github/workflows/ci.yml`）は上の全部に加えて、生成アートがコミット済み PNG と一致することを確認し、プレイヤー/作成アプリ e2e のスクリーンショットを artifact に残す。

## riku がやること（本番に必要な設定）

秘密情報はすべて `wrangler secret put` か EAS の Secret に入れる。リポジトリと `wrangler.jsonc` には書かない。

### 1. Cloudflare（Worker / D1 / R2）
1. D1 データベースを作り、`wrangler.jsonc` の `database_id` を実 ID に置き換える。R2 バケット `gift-for-you-photos` を作る。
2. `wrangler d1 migrations apply DB --remote`（0001, 0002）。
3. ドメインを決め、`PUBLIC_ORIGIN` を設定。`CORS_ORIGINS` は空（ネイティブアプリは CORS 不要）。`MOCK_INSPECT` は設定しない。
4. secrets：`ADMIN_TOKEN`（`openssl rand -base64 48` など）、`HASH_SALT`（同様にランダム）。
5. `/admin/*` の前に **Cloudflare Access**（Zero Trust、メールでの許可）を置く（二重の鍵として推奨）。
6. cron は `wrangler.jsonc` の `17 * * * *`（毎時）。デプロイは riku が行う。

### 2. App Store Connect / Google Play Console
1. 消耗型の商品を2つ作る：`gfy_gift_standard`（¥480）、`gfy_gift_premium`（¥980）。iOS は価格帯を選び、表示名と説明を入れる。
2. iOS：Sign in with Apple の capability を App ID で有効化（`app.json` の `ios.usesAppleSignIn` は設定済み）。
3. 有料アプリ契約・銀行口座・税務情報（App Store の「契約/税金/口座情報」、Play の販売者アカウント）。
4. Sandbox テスター（App Store）とライセンステスター（Play）。

### 3. RevenueCat
1. プロジェクトを作り、iOS/Android アプリを登録（App Store の In-App Purchase Key / App Store Connect API キー、Play のサービスアカウント JSON を RevenueCat に登録）。
2. 2つの商品を取り込む（Offering は不要。アプリは商品 ID で直接取得する）。
3. 公開 SDK キー（`appl_…` / `goog_…`）を EAS の環境変数 `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` に。
4. シークレット API キー（v1、`sk_…`）を `wrangler secret put REVENUECAT_SECRET_KEY`。
5. Webhook：URL `https://<ドメイン>/webhooks/revenuecat`、Authorization ヘッダー値を自分で決めて同じ値を `wrangler secret put REVENUECAT_WEBHOOK_AUTH`。
6. App Review は Sandbox で購入するので `REVENUECAT_ALLOW_SANDBOX` は `1`（既定）のまま。管理画面の売上には sandbox 件数を別に出している。
7. `PURCHASE=revenuecat` に切り替え。

### 4. 写真モデレーション（Google Cloud Vision）
1. GCP プロジェクトで Cloud Vision API を有効化、課金を設定。
2. API キーを作り、**Cloud Vision API のみ**に制限。`wrangler secret put GOOGLE_VISION_API_KEY`。
3. データの取り扱い条件を確認し、プライバシーポリシーの該当箇所（【Google Cloud のデータ保持条件を確認して記入】）を埋める。
4. 文章の NG 語リスト（`BLOCKED_WORDS`）は最小限のサンプル。運用で使うリストに差し替える。
5. `MODERATION=vision` に切り替え。

### 5. プッシュ通知（APNs / FCM）
1. `eas init` で EAS プロジェクトを作り、`app.json` の `extra.eas.projectId` に入れる。
2. `eas credentials` で APNs キー（iOS）と FCM v1 のサービスアカウント（Android）を登録。
3. Expo の Enhanced Push Security を使う場合は `wrangler secret put EXPO_ACCESS_TOKEN`。
4. `NOTIFIER=expo` に切り替え。

### 6. サインイン連携
1. `SIGNIN=oidc`、`APPLE_AUDIENCE=app.giftforyou.creator`（バンドル ID）。
2. Google サインインを出すなら、OAuth クライアント ID を作って `GOOGLE_AUDIENCES` に入れ、アプリにネイティブモジュール（`@react-native-google-signin/google-signin` など）を追加する（未実装、サーバー側は検証済み）。

### 7. 法務・ストア申請
1. `/legal/*` と `/support` の【 】をすべて埋め、専門家の確認を受ける。`SUPPORT_EMAIL` を設定（サポート窓口のメール）。
2. 特商法表記の所在地・電話番号を記入（または「請求があれば遅滞なく開示」の方式を選ぶ）。
3. App Privacy / データセーフティを [store-privacy.md](store-privacy.md) の下書きから入力。
4. 年齢区分・UGC の回答を [store-ugc-age.md](store-ugc-age.md) から入力。
5. ストアのサポート URL：`https://<ドメイン>/support`、プライバシーポリシー URL：`https://<ドメイン>/legal/privacy`。
6. `eas build` → TestFlight / 内部テストで実機確認（下の残課題）→ 提出。

## 残課題

- **実機未確認**：RevenueCat 購入、Sign in with Apple、プッシュ、WebView プレビュー、画像選択はどれも iOS/Android 実機・Expo Go で動かしていない（Web ビルドのみ e2e）。`react-native-purchases` と `expo-apple-authentication` はネイティブモジュールなので Expo Go では動かず、開発ビルドが必要。
- **Google サインインのアプリ側**は未実装（サーバーの ID トークン検証のみ）。
- **文章モデレーション**は語句リストのみ。必要なら外部 API（例：Perspective）を `Moderator.text` に足す。
- **通報の閾値と自動非公開の方針**（3人、削除依頼は即時）は仮。悪用（嫌がらせ目的の削除依頼）の運用ルールが要る。
- 管理画面は1つの共有トークン。担当者が複数なら Cloudflare Access の個人認証を必須にする。
- 通報者の数え方は IP（ソルト付きハッシュ）。同じ回線の複数人は1人、VPN を変えれば別人になる。
- ブロックは閲覧者のブラウザ単位（ランダムキー）。別のブラウザ・端末には効かない。
- 返金されたギフトは公開したまま（管理画面で売上から除くだけ）。方針が決まれば webhook で非公開にできる。
- ストア価格は Apple/Google の価格帯で決まるため、¥480/¥980 ちょうどにならない場合がある（表示は RevenueCat から取得した現地価格を優先）。
- Phase 2 の残課題（ビーコンの無認証・レート制限なし、Web ビルドの端末キーが localStorage など）はそのまま。
