# Browser journeys, paint guards, and visual baselines

Status: Luna 5 core, Chromium-local. Not wired into CI yet.

## Run

```bash
npm run e2e:install   # once: downloads Chromium into .browsers/ (repo-local)
npm run e2e           # starts the dev server itself (reuses a running one)
npm run e2e -- --update-snapshots   # regenerate visual baselines
```

## What this suite locks in

Three layers, added after two shipped bugs that unit tests could not see:

1. **Play journeys** (`play.spec.ts`) — the household loop at real window
   sizes: click a grid cell, type, letters land; arrows move focus; clicking
   a clue-spine answer cell lands focus in the *grid* (spine cells share
   `data-cell-id` but have no key handlers); no `17/17` duplicate numbers;
   the day/night toggle paints basalt and persists across reload.
2. **Paint guards** (`highlights.spec.ts`) — computed-style assertions on the
   rendered result: the active clue row must paint an opaque surface plus a
   seam accent (the shipped bug was an undefined CSS variable computing to
   transparent), crossings tint in their own family with ringed cells, and
   the rotated field marks render at legacy scale.
3. **Visual baselines** (`visual.spec.ts`) — panorama 1440, standard 1136,
   night mode, and the half-collapsed harness fixture. The clock is masked
   (the one deliberately dynamic surface). Regenerate with
   `npm run e2e -- --update-snapshots` and review the diff before committing.

## Notes

- Chromium lives in `.browsers/` (gitignored) via `PLAYWRIGHT_BROWSERS_PATH`.
- The dev server is reused when already running, so `make web-dev` plus
  `npm run e2e` share one instance.
- CI wiring, Firefox/WebKit projects, and axe checks are the remaining
  Luna 5 scope.
