# Phase 2: creator app and gift server

## Layout

| path | what |
| --- | --- |
| `apps/creator` | Expo (SDK 58, TypeScript, expo-router) app for the sender. `src/lib` is plain TypeScript with Vitest tests; `src/native` wraps device APIs (`*.web.ts` for the web build). |
| `packages/server` | Cloudflare Worker (Hono) with D1 and R2. Serves the API, the revoke page, and the player bundle as static assets. |
| `packages/imaging` | JPEG header walker: strips Exif/GPS/XMP/comments, reads the frame size. Used by the app and the server. |
| `packages/player` | Phase 1 player, now also loading published gifts from `/s/{id}/share` and a local preview at `/preview`. |
| `packages/schema`, `packages/catalog` | Share JSON v1 and the catalog, shared by all three. Adds `LIMITS`, `SHARE_TTL_DAYS`, `TEMPLATES`, `DIFFICULTIES`, and `egift.locked`. |

## Run it

```
pnpm install
pnpm --filter @gfy/player build      # the Worker serves this bundle
pnpm --filter @gfy/server dev        # wrangler dev on http://127.0.0.1:8787, local D1/R2, mock providers
pnpm --filter @gfy/creator web       # Expo web on http://127.0.0.1:8081
```

On a phone with Expo Go, set `EXPO_PUBLIC_API_ORIGIN=http://<LAN IP>:8787` and start the server with `--ip 0.0.0.0`. `pnpm --filter @gfy/server smoke` drives one gift through a running `wrangler dev` (upload, publish, photo fetch, web revoke).

## Creator flow

| req | screen | notes |
| --- | --- | --- |
| F2-01 | `create/template` | `TEMPLATES` (course-01, 4 coin slots). |
| F2-02 | `create/obstacles` | easy / normal / hard map to `preset-easy|normal|hard`. |
| F2-03 | `create/coins` | Pick → `expo-image-manipulator` resizes the long edge to 1080 px and re-encodes JPEG → `cleanJpeg` strips anything left (Exif, GPS, XMP, comments) and rejects >1080 px → one line (40) → ↑/↓ reorder, replace, delete. Coins are capped at the template's slots. |
| F2-04 | `create/item` | All `GIFT_ITEMS`, name up to 20. |
| F2-05 | `create/letter`, `create/egift` | Names (12), letter (500). E-gift URL: non-https and shorteners block; off-list domains need an explicit check. Or a code (80). |
| F2-13 | `create/egift` | Optional passphrase (4–32). The server stores a PBKDF2 hash; the player asks for it before showing the URL or code (5 tries per 10 min). |
| F2-06 | `create/preview` | The player from the Worker at `/preview`. Native: WebView with `window.__GFY_PREVIEW__` injected before load and navigation pinned to the player origin. Web: sandboxed iframe, payload via `postMessage` to the player origin only. The player validates it like a published gift, sends no beacons, and the e-gift link goes nowhere. |
| F2-07 | all | The draft autosaves to AsyncStorage 300 ms after each change; photos live under their own keys. |
| F2-08 | `create/publish` | Upload (and server-side moderation) → text moderation → preview again → Sandbox purchase → share id (10 base62) with a fixed 14-day expiry → link, QR, share sheet. Any rejected photo stops the flow until it is replaced. |
| F2-09 | `gift/[giftId]` | Registers a push token after publishing. The server pushes `opened` and `goal_reached` once per gift and type (`notifications` primary key). |
| F2-10 | `gift/[giftId]`, `/r/{shareId}` | Revoke from the app (device key) or from any browser with the revoke code shown once at publish. Revoke, expiry, and the cron sweep delete the R2 photos and the stored content. |
| F2-11 | `history` | Anonymous device key (32 random bytes in SecureStore; the server keeps only its SHA-256) lists this device's gifts with opened/goal state. |
| F2-12 | `gift/[giftId]` | QR card: view-shot + share sheet on native, SVG → PNG download on web. |

## API

All `/api/*` routes need `Authorization: Device <key>`.

| route | |
| --- | --- |
| `POST /api/gifts` | new server draft (20 per device per day) |
| `PUT /api/gifts/{id}/photos/{ref}` | JPEG ≤ 1.5 MB and ≤ 1080 px; re-stripped, moderated; rejected photos are not stored |
| `PUT /api/gifts/{id}/content` | `{share, reveal, passphrase?}`; Share/Reveal parsers + server rules + text moderation |
| `POST /api/gifts/{id}/purchase` | `{platform, transactionId}` checked by the purchase verifier; one transaction per gift |
| `POST /api/gifts/{id}/publish` | `{shareId, url, expiresAt, revokeCode, revokeUrl}` |
| `DELETE /api/gifts/{id}` | revoke (published) or delete (draft) |
| `GET /api/gifts` | this device's gifts |
| `PUT/DELETE /api/devices/push` | push token |
| `GET /s/{shareId}/share`, `/photos/{ref}`, `/reveal` | player reads; unknown, revoked, and expired answer the same 404 |
| `POST /s/{shareId}/events`, `/unlock` | beacons, passphrase |
| `GET/POST /r/{shareId}` | revoke page |

## Providers

Vars pick providers. Only mocks exist. The deployed defaults in `wrangler.jsonc` are `none`, so a plain `wrangler deploy` serves published gifts but answers 503 to anything that needs moderation, purchase, or push, instead of falling back to a mock. `pnpm --filter @gfy/server dev` and `e2e:serve` turn the mocks, `MOCK_INSPECT`, and the localhost origins on with `wrangler dev --var`.

| var | value here | mock behavior |
| --- | --- | --- |
| `MODERATION` | `mock` | rejects images containing the bytes `GFY-NG` and text containing `NGWORD` |
| `PURCHASE` | `sandbox-mock` | accepts `{platform: "sandbox", transactionId: "sandbox-…"}` |
| `NOTIFIER` | `mock` | writes to `mock_push_outbox`; `GET /api/_mock/push` reads it when `MOCK_INSPECT=1` |

## Checks

```
pnpm build && pnpm test && pnpm lint && pnpm typecheck
pnpm e2e            # Phase 1 player
pnpm e2e:creator    # Expo web build + wrangler dev
```

Server tests run the real migrations and SQL on `node:sqlite` with an in-memory R2. The creator e2e goes template → obstacles → three photos (2400×1600 and 1200×2000 with a spliced Exif/GPS segment, plus 800×600) → item → letter → e-gift → preview → upload/moderation → preview → sandbox purchase → link and QR, then checks on the server that the photos came out 648×1080, 1080×720 and 800×600 with no Exif, that the expiry is 14 days, that pushes fire once each, that the recipient link plays, and that revoking removes the share and photos.

## Remaining items

These need accounts, keys, money, or devices, and are left as interfaces or notes.

- Moderation: `Moderator` has only the mock. A hosted image/text safety API (and its key as a Worker secret) is needed before launch.
- Purchases: `Store` (app) and `PurchaseVerifier` (server) have only the sandbox mock. StoreKit / Play Billing, likely through RevenueCat, plus server receipt verification. Price is not decided.
- Push: needs an EAS project id in `app.json` (`extra.eas.projectId`) and APNs/FCM credentials, plus a `Notifier` that calls Expo's push API (or APNs/FCM directly). Until then the app reports "unconfigured" and the history screen shows opened/goal.
- Deploy: real D1 id, R2 bucket, domain, `PUBLIC_ORIGIN` (empty by default; publishing answers 503 until it is set), `CORS_ORIGINS` (drop the localhost entries), `MOCK_INSPECT` off. Not deployed.
- Native builds: only the web target ran here. The WebView preview, image picker, SecureStore, view-shot, and share sheet have not run on an iOS or Android device or in Expo Go.
- The e-gift allowlist is still the constant in `@gfy/schema`; an operator-managed list is open from Phase 1.
- The reveal gate is per gift (`goal_at`), as in Phase 1: after the recipient reaches the goal once, anyone with the link can read the letter. The passphrase protects the e-gift itself.
- No per-IP rate limit yet beyond the per-device draft cap and per-gift attempt windows; Workers rate-limiting bindings would cover upload abuse.
- `POST /s/{shareId}/events` has no authentication or rate limit, as in Phase 1: anyone with the link can raise `opened_count` and `goal_count`. The sender's history shows opened/goal (first time only), so the counts are indicative until a limit (per IP and gift) lands. The push still goes out only once per type.
- The web build keeps the device key in `localStorage` (native builds use SecureStore). Any XSS on the creator's web origin could read it and act as that device (list, revoke, publish its drafts). The web build is for development and e2e; shipping it needs a strict CSP and, ideally, a non-extractable key.
- A lost device key cannot be recovered; the revoke code is the fallback for revoking.
- Terms, privacy policy, and store listings are not written.
