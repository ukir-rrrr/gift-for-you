# Arena rationale

## The course is data, and Phaser only draws

`@gfy/catalog` holds the course beats, obstacle presets, hero parts, gift items, and the 28-color palette as typed registries. `@gfy/schema` parses Share JSON v1 with Zod, drops unknown fields, and strips control characters and emoji from display text. `compileCourse` turns a template plus a difficulty preset into solids, gaps, thorns, moving platforms, coins, checkpoints, and the goal. `@gfy/player` runs that world in `PlatformerMode`, which implements `GameMode` with `load`, `update`, `render`, and `onGoal`. The sim steps at 1/60 s and interpolates the render. Phaser is the view. `PlayScene` reads a snapshot and draws layered sprites. `scripts/generate-art.ts` paints the sheets, tiles, gifts, parallax, and photos with pngjs, and it throws if a pixel leaves the palette.

## Two other shapes

Phaser Arcade could have owned the bodies. Stride, coyote time, and a full-course clear would then need a browser, and a later kart mode would inherit that physics. The sim stays plain TypeScript so Vitest can step it.

Aseprite sheets and a Tiled map were the other way to store art and collisions. `generate-art.ts` reruns in `pretest` and `prebuild`, and the palette test reads every PNG. The course compiler is the map.

## Six frames and eight frames share one sheet

`WALK_6` has stride 12 px. `WALK_8` has stride 16 px. Stride is the full cycle, two steps. One planted foot travels half of that. Plant frames of the same foot move `localX` by 2 px, which is `stridePx / frameCount`, so `maxContactSlip` is 0. At speed `v` px/s the cycle lasts `T = stridePx / v`. Each frame lasts `T / frameCount`. At `v === 0` the phase is idle. Contact pixels sit on row 23 of the 16×24 frame.

`?walk=6`, `?walk=8`, the C key, and the on-screen button call `setWalkFrames`. That swaps `walkFrames`, resets `walkFrame` and `walkAcc` to 0, and selects `ANIM_INDEX.walk6` or `ANIM_INDEX.walk8`. Both cycles sit on one 21-frame sheet per part, with idle, jump ascent, apex, fall, land, and turn on the same sheet. Playback advances with `|vx|`.

## Run it

```
pnpm install
pnpm test
pnpm build
pnpm --filter @gfy/player dev
```

Open `http://127.0.0.1:5173/g/demo`. `?e2e=1` uses the short course and easy auto-walk. `pnpm e2e` runs Playwright against that flow.

`vite build` reports the player JS chunk at 184.67 kB gzip. The custom entry is `packages/player/src/phaser-slim.js`. It keeps the canvas renderer, sprites, tile sprites, and the image loader. Initial assets other than `photos/` are 510736 bytes, including both PixelMplus woff2 files.

## Gaps against section 16

The sample gift clears in the browser, and the normal-course bot stays inside 90 to 150 seconds of sim time. Schema, palette, stride, physics, preset slots, emoji stripping, assist choices, reveal beats, the typewriter, sound cues, settings, and beacons have unit tests. Playwright covers title, play, coin popup and photo fallback, the help menu, the three opening beats, the letter, the e-gift confirm (allowed and off-list), recording mode, the rotate prompt, settings persistence, and the shared error page on Chromium at 390×844 and an iPhone 13 profile.

These acceptance items are still open.

- The automated browser is desktop Chromium with phone viewports. LINE and Instagram in-app browsers and real iOS Safari have no capture in this tree.
- The sim is locked to 1/60 s. This machine has no mid-range device fps sample.
- riku has not watched a capture or signed the art or the sound.
- The clear time in `sim.test.ts` is the bot. Three people have not played the course.
- The create form, moderation, photo upload, and 14-day expiry need a hosted backend and storage contract; they stay out of this task.
- Beacons POST to Vite middleware at `/s/{id}/events`. The middleware answers 204 and keeps `goal_reached` in memory for the reveal check. Production needs a real endpoint that stores the section 13 counts.
- The dev server returns the letter only after `goal_reached`. On a static host, a failed GET falls back to the bundled letter once the goal flag is set, so letters there are not secret. Production needs the server-side gate.
- The e-gift allowlist is a constant in `@gfy/schema`. Production needs the operator-managed list.
- Phase 2 stays for a later GO.
