# Arena synthesis

Base: candidate A (`cursor/arena-a-2492`). Phaser slim (~185KB gzip), layered hair/skin/outfit, Share JSON + `compileCourse` in `@gfy/catalog`.

Cross-judge (composer-2.5) also picked A. Parent scores agreed on the base. Disagreement was only on walk (B higher) and completeness (B higher); those are grafts, not a base swap.

## Grafts

- From B: pose-table walk cycles (`HeroFrame` feet/arms, `plantedSlide`, `remapWalkFrame`) in `@gfy/catalog`, and session `fold` for title/play/assist/reveal/letter.
- From C: headless `runReplay` over the existing sim, without taking C's single-sheet renderer.

## Rejected

- B as base: full Phaser chunk ~364KB gzip, over the 300KB first-JS budget.
- C as base: composite body sheet, non-integer scale, untested foot plant, e2e forced `goalReached`.

## Convergence

All three used Zod Share v1, 1/60 sim, pngjs palette art, demo `/g/demo`, and beacon POST with a local queue.
