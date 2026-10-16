# gift-for-you

Phase 1 browser player (`packages/player`, demo gift `/g/demo`) and the Phase 2 creator app (`apps/creator`) with its gift server (`packages/server`). Phase 2 setup, flow, API, and remaining items: [`docs/phase2.md`](docs/phase2.md).

```
pnpm install
pnpm test
pnpm --filter @gfy/player dev
```

Open `http://127.0.0.1:5173/g/demo`. Walk cycle: `C`, on-screen button, or `?walk=6|8`. Compact e2e course: `?e2e=1`.

## Player flow

- Title names the recipient (`彩へ、ちょっとした冒険を`), also in the tab title. Nothing plays or beacons before はじめる.
- Memory coins pop a framed photo and message for 2 s. A photo that fails to load shows `photos/placeholder.png`.
- After `autoAssistAfterFails` misses the hero waits at the checkpoint and お助け offers むてき, ふわふわ, かんたん (auto-walk), この先へ (skip the section and collect its coins), or このまま.
- At the pedestal a tap opens the gift in three beats (shake, burst, show), then the letter types out. Tapping the letter finishes it. The e-gift button appears only after that.
- The e-gift confirm screen shows the domain in large type. Domains off the allowlist get a warning and a それでも開く link; shorteners and non-https are blocked.
- Unknown, malformed, and expired ids show the same error text. Every page is `noindex`; the dev server also sends `X-Robots-Tag` on `/g/` and `/s/`.
- Touch devices held sideways get たてむきにしてね and the sim pauses. Full-screen layers pad for safe areas.
- Sound: a chiptune loop and effects after the first tap. おと and てんめつ toggles persist; reduced motion starts with flashing off.

## Query flags

| flag | effect |
| --- | --- |
| `?rec=1` | recording mode: no pad or debug chrome, watermark, auto-walk, gift opens by itself, no e-gift |
| `?e2e=1` | compact course with auto-walk |
| `?easy=1` | auto-walk |
| `?difficulty=easy\|normal\|hard` | obstacle preset |
| `?walk=6\|8` | walk cycle frames |

## Beacons

`opened` (on はじめる) and `goal_reached` POST `{type, at}` to `/s/{id}/events` with credentials omitted. A failed POST is queued in `localStorage` (deduped, max 20) and retried on the next visit. Named crawlers and prerendered pages never send. Storage errors never stop play.

## Published gifts and preview

Ids that are not bundled samples load `/s/{id}/share` from the gift server, with photos from `/s/{id}/photos/{ref}`. `/preview` plays a gift handed over by the creator app (`window.__GFY_PREVIEW__` or a `postMessage` from the parent frame): no beacons, and the e-gift link goes nowhere. A passphrase-locked e-gift asks for the passphrase after the letter.

## Checks

```
pnpm build && pnpm test && pnpm lint && pnpm typecheck && pnpm e2e && pnpm e2e:creator
```

`pnpm test` includes the frozen replay tapes (`packages/player/test/tapes`). If the bundled Playwright Chromium does not match, set `PW_CHROMIUM=/path/to/chromium`.

Arena notes: `ARENA_SYNTHESIS.md`.
