# Crossword design-language refresh specification

Status: implementation specification for Luna agents.  
Owner: product/design specification — primary Codex agent; implementation —
delegated Luna agents.  
Scope: solving experience and visual system. This document does not authorize a
generic redesign of the product.

## 1. Product position

The app's visual identity is not “a crossword with clue lists on both sides.”
Its identity is a **crossword instrument**: the grid is the stable center and
the clue field wraps around it as two mirrored, information-dense spines. Every
clue exposes the live shape of its answer. Every crossing is visible in the
grid and in both clue fields.

The refresh must make that original idea more legible, tactile, and adaptive.
It must not replace it with an editorial landing page, a conventional
newspaper layout, a dashboard, or a generic three-column application shell.

“AI-native” describes how the puzzle is prepared and how its clues adapt. It
does not mean neon gradients, chat bubbles, constant model activity, or an AI
brand layer obscuring play. During a solve, intelligence should feel ambient:
the puzzle fits the players, nudges are genuinely useful, and the interface
quietly explains what changed when asked.

## 2. Evidence from the original product

The legacy interface establishes the product's signature behaviors:

1. Across occupies the full left field and Down the full right field.
2. Each direction is split into two clue lanes.
3. A paired number seam sits between those lanes:

   ```text
   clue text →  1 │ 2  ← clue text
   clue text →  3 │ 4  ← clue text
   clue text →  5 │ 6  ← clue text
   ```

4. Each clue contains a row of answer cells showing both enumeration and the
   letters already entered.
5. Selecting a word highlights its grid cells, its clue, every crossing clue,
   and the exact answer cell shared at each crossing.
6. Across and Down have different visual identities (historically orange and
   blue).
7. Solved clues become quieter or disappear so the remaining puzzle opens up.
8. Grid, clues, and essential controls coexist in one desktop viewport.

These are product invariants. Their implementation may change; their effect on
the player may not.

## 3. Problems in the present rewrite

The current React composition is a useful technical scaffold but not an
acceptable design target.

- The oversized title region consumes the first third of the viewport and
  makes the solver feel like content below a landing-page hero.
- The 15×15 grid is visually small relative to the available desktop canvas.
- Clue fields begin below substantial application chrome and extend far beyond
  the viewport.
- The two clue lanes are present structurally, but their text does not face the
  number seam; the mirrored reading rhythm is therefore lost.
- Answer patterns are hairline underscores rather than unmistakable live
  answer cells.
- “Across / N letters” repeats information that direction placement and answer
  cells already communicate.
- Only the selected clue is emphasized. The opposite crossing clues and exact
  crossing cells are not propagated through the clue field.
- The command bar falls below the long clue rails and is not available during
  ordinary play.
- Across and Down no longer have equally strong, distinct identities.
- Development copy such as “Local workspace / offline ready” competes with
  puzzle information in the production composition.

The refresh addresses these failures without discarding the provider-neutral
domain, accessible button grid, worker boundaries, or local-first architecture.

## 4. Design principles

### 4.1 Grid gravity

The grid is the heaviest object, the visual origin, and the spatial reference
for every other element. Nothing above it may resemble a hero section. The
grid should be usable without scrolling on a typical laptop and should be as
large as the available height safely permits.

### 4.2 Bilateral clue topology

Clues are spatial data, not cards in a feed. Each direction owns a field; each
field owns two lanes and a central paired number seam. Content in the outer
lane aligns inward toward the seam. Content in the inner lane aligns outward
from the seam. The result is a mirrored, concentric reading rhythm on both
sides of the grid.

### 4.3 Answer shape before metadata

The live answer cells are the primary metadata. Their count communicates
length; their contents communicate progress; their individual state communicates
selection, crossing, checking, reveal, rebus, circle, and shade. Textual
enumeration remains available to assistive technology and may appear as a
compact fallback, but not as repetitive visual prose.

### 4.4 One strong signal, many quiet echoes

The active entry receives one strong treatment. Its crossing entries receive a
quiet treatment. Their exact crossing cells receive a precise marker. Everything
else remains calm. Selection must never turn the entire screen into a field of
equal highlights.

### 4.5 Adaptive density, stable geography

Clue lane assignment never changes accidentally because another clue is
solved. Completion can collapse presentation, but it cannot flip later clues
from one side of the seam to the other. Spatial memory is a feature.

### 4.6 Intelligence without theatre

No model token stream, fake confidence meter, or “AI sparkle” appears in the
solver. The local model's presence is expressed through original puzzle
provenance, clue-ladder actions such as Nudge, and an inspectable “why this
puzzle?” explanation outside the primary play surface.

## 5. Panorama composition

Reference canvas: 1920×1080 CSS pixels at 100% zoom.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ wordmark   WED · ORIGINAL · PRIVATE                    00:18   AI QUEUE 2 │  52
├──────────────────────────────────────────────────────────────────────────┤
│ Crossing Signals · Wednesday · 15×15 · made for two players             │  58
├───────────────────────┬──────────────────────────┬───────────────────────┤
│       ACROSS          │                          │          DOWN         │
│ outer →  1│ 2 ← inner│                          │inner →  1│ 2 ← outer │
│ outer →  3│ 4 ← inner│       15 × 15 GRID       │inner →  3│ 4 ← outer │
│ outer →  5│ 6 ← inner│                          │inner →  5│ 6 ← outer │
│                       │ active clue + cells      │                       │
│ independent scroll    │ compact solve commands  │ independent scroll    │
└───────────────────────┴──────────────────────────┴───────────────────────┘
```

Reference measurements are constraints, not arbitrary fixed pixels:

- outer page gutter: 16–24 px;
- utility rail: 48–56 px;
- puzzle identity rail: 52–64 px;
- gap between grid and each clue field: 16–28 px;
- grid: `clamp(500px, min(38vw, calc(100dvh - 230px)), 640px)`;
- each clue field: all remaining width, minimum 390 px for two-lane mode;
- number seam: 32–42 px;
- clue lane: minimum 168 px, preferred 220–280 px;
- visible solver height: remaining dynamic viewport height, with no page-level
  vertical scroll during normal 15×15 play;
- clue fields scroll independently when their content exceeds that height;
- scrollbar chrome is quiet but discoverable with mouse, keyboard, and touch.

The center stage may be sticky within the solver region. The clues may scroll;
the grid does not leave the player's visual field.

## 6. Clue-field projection

Lane placement is calculated once from the ordered entries for a direction:

```ts
type CluePlacement = Readonly<{
  entryId: EntryId;
  direction: Direction;
  lane: 'outer' | 'inner';
  row: number;
}>;

lane = index % 2 === 0 ? 'outer' : 'inner';
row = Math.floor(index / 2);
```

Placement belongs to a view projection, not to CSS `nth-child` behavior.
Filtering, clue variant changes, error states, and completion must not mutate
placement.

### 6.1 Row anatomy

Each visible clue row contains:

- clue text, two lines preferred and three allowed;
- optional mechanism marker only when it adds information (`wordplay`, `abbr.`,
  `rebus`, etc.); it must not expose the answer;
- one answer cell for each grid cell in the entry;
- the clue number at the central seam;
- a non-color solved/check/reveal marker when applicable.

Do not render a permanent “ACROSS / 4 LETTERS” line. The field heading provides
direction and the answer cells provide length.

### 6.2 Alignment

- Outer-lane copy and answer cells align toward the number seam.
- Inner-lane copy and answer cells align away from the number seam.
- Number pairs align on a stable baseline even when neighboring clue copy wraps.
- The seam is visually continuous through hairline rules or rhythm, not a
  glowing line.
- On the right-hand Down field, the entire field is mirrored around its own
  seam; it is not a copy of left-field text alignment.

### 6.3 Completion policy

User preferences:

- `visible`: retain solved clue and cells at reduced emphasis;
- `collapsed` (default): keep its number and placement, collapse copy/cells;
- `hidden`: remove it and deliberately reflow rows.

For `collapsed`, a row can shrink only when both entries in its pair are
collapsed. This preserves the paired spine and avoids one clue pulling its
neighbor into an unrelated vertical position.

When fewer than half the clues remain, available space may increase clue type
by one defined size step. It must be a deterministic density mode, not a
continuous animated resize.

## 7. Linked-state contract

Let `A` be the active entry and `c` the selected grid cell.

### 7.1 Active entry

- Active clue: direction accent bar plus a restrained tinted surface.
- Active answer cells: direction-tinted border/background.
- Selected answer cell: filled accent or double-line marker with sufficient
  contrast.
- Active grid entry: same direction family as the clue, at lower intensity.
- Selected grid cell: strongest fill in the family plus a shape/outline cue.

### 7.2 Crossing entries

For every entry `B` of the opposite direction where `A ∩ B` is non-empty:

- `B` receives a quiet affected state in its own direction family;
- the answer cell representing `A ∩ B` receives an active-direction crossing
  ring or inset marker;
- the corresponding grid cell is already part of `A`; no additional full-cell
  color is required;
- clicking that answer cell changes selection to `B` at the shared cell;
- toggling direction at `c` swaps which clue is active without changing `c`.

This relationship must be derived from `PuzzleIndex`, never duplicated as a
second mutable selection model.

### 7.3 Required state matrix

| State | Clue row | Answer cell | Grid cell | Non-color cue |
| --- | --- | --- | --- | --- |
| Idle | neutral | outlined | paper | geometry |
| Active entry | accent edge + tint | tint | pale tint | 3 px edge |
| Selected cell | active row | strong fill | strong fill | outline/inset |
| Crossing entry | quiet tint | shared ring | unchanged | cross mark |
| Filled | unchanged | letter + stronger ink | letter | text |
| Checked correct | quiet success | success tick/dot | success tick/dot | icon |
| Incorrect | error edge | error slash/dot | error slash/dot | icon |
| Revealed | assist tint | `R` marker | `R` marker | text marker |
| Circled | unchanged | circular boundary | circular boundary | shape |
| Rebus | unchanged | compressed token | fitted token | count/token |
| Solved | preference policy | check | unchanged | check |

Across/Down, error/success, and selected/crossing distinctions cannot rely on
color alone.

## 8. Center stage

### 8.1 Grid

- The grid is square, high-contrast, and at least 500 px on the reference
  panorama canvas.
- Blocks are the darkest stable surface; open cells use the lightest stable
  surface.
- Internal grid lines remain visible at 100%, 200%, and in dark mode.
- Entry highlighting never obscures clue numbers, letters, circles, shades, or
  check/reveal markers.
- Keyboard focus stays on the logical selected grid cell.
- No cell causes reflow when a letter or state marker appears.

### 8.2 Active-clue bridge

Immediately below the grid is a compact active-clue bridge. It is not a third
copy of the whole clue list; it exists to bridge eye movement between grid and
spines.

It contains, in one or two compact rows:

- number and direction;
- active clue;
- live answer cells;
- optional Nudge action;
- crossing clue at the selected cell, visually subordinate.

On panorama the bridge is 56–92 px high. On compact layouts it becomes sticky
and is the primary clue surface.

### 8.3 Commands

Check, Reveal, Pause, Nudge, and navigation remain reachable without scrolling.
Use a compact command strip attached to the center stage. Progressive actions
may use menus:

- Check → cell, word, grid;
- Reveal → cell, word, grid, with confirmation proportional to scope;
- Nudge → easier grounded clue variant, never a letter reveal;
- More → restart, export/import, accessibility, model/puzzle information.

Model setup and storage diagnostics do not occupy the ordinary solve surface.

## 9. Utility and puzzle identity rails

The top of the application is instrumentation, not marketing.

### Utility rail

- wordmark;
- local-save state only while saving or on error;
- active time;
- prepared-puzzle queue state when relevant;
- settings/more access.

### Puzzle identity rail

- title at 22–32 px, never display/hero scale;
- weekday recipe, size, original/imported provenance;
- optional author/model recipe label;
- short notepad/theme note only when the puzzle requires it.

Development phrases such as “local workspace,” endpoint URLs, model memory
floors, and version labels belong in diagnostics.

## 10. Visual tokens

Tokens are semantic. Components must not introduce one-off hex values.

```css
:root {
  --surface-canvas: oklch(0.972 0.012 82);
  --surface-raised: oklch(0.988 0.008 82);
  --surface-sunken: oklch(0.935 0.018 78);
  --ink-strong: oklch(0.245 0.018 62);
  --ink-muted: oklch(0.49 0.025 65);
  --line-soft: oklch(0.82 0.018 72);
  --line-strong: oklch(0.43 0.02 65);

  --across: oklch(0.58 0.16 45);
  --across-soft: oklch(0.91 0.055 48);
  --down: oklch(0.53 0.115 238);
  --down-soft: oklch(0.91 0.04 238);
  --success: oklch(0.49 0.105 151);
  --error: oklch(0.54 0.18 28);
  --assist: oklch(0.66 0.095 92);

  --font-clue: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --font-ui: Inter, ui-sans-serif, system-ui, sans-serif;
  --font-pattern: ui-monospace, "SFMono-Regular", Consolas, monospace;

  --radius-1: 3px;
  --radius-2: 7px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --focus-ring: 0 0 0 3px color-mix(in oklch, var(--down) 58%, white);
  --elevation-grid: 8px 10px 0 color-mix(in oklch, var(--down) 12%, transparent);
}
```

Final values must pass contrast checks in context; these are the starting
palette and semantic names.

### Typography

- clue copy: 14–17 px depending on density, 1.22–1.35 line-height;
- number seam: 10–12 px mono, tabular numerals;
- answer cells: 11–13 px mono, uppercase;
- utility labels: 10–12 px UI sans, uppercase only for short instrumentation;
- title: 22–32 px clue serif;
- body/settings copy: 14–16 px UI sans.

### Shape and elevation

- Clues are rows, not floating cards.
- The grid may use the one strong static elevation treatment.
- Panels use borders before shadows.
- Maximum routine radius is 7 px; grid cells remain square.
- No backdrop filters on the solver surface.
- No large blurred glows.

## 11. Motion and energy

Allowed during ordinary play:

- 100–160 ms background/color transition on the previous and next active
  elements;
- 120–180 ms opacity/transform transition when a solved clue collapses;
- one short completion transition when motion is enabled.

Forbidden:

- `transition: all`;
- infinite animation;
- animated `filter`, `box-shadow`, or large gradient positions;
- continuously running canvas, audio, socket, or model work in solo play;
- smooth scrolling on every keystroke;
- whole-tree React updates solely to render the clock.

At idle during a solve, the page must settle to browser-baseline CPU use.

## 12. Responsive modes

Breakpoints are based on available component space, preferably with container
queries.

### Panorama

When both direction fields can provide two lanes of at least 168 px plus their
number seams and a grid of at least 500 px:

- full two-lane Across field;
- stable center grid/bridge/commands;
- full two-lane Down field;
- independent clue-field scrolling.

### Standard

When the panorama minimum cannot fit:

- one Across rail, grid, one Down rail;
- number and answer cells stay visible;
- active and crossing linkage remains identical;
- center grid remains at least 420 px when height allows.

### Compact

- grid first;
- sticky active-clue bridge;
- clue browser in accessible Across/Down tabs or a bottom sheet;
- visual cell targets may be smaller than 44 px, but an expanded invisible hit
  target or equivalent control must provide a 44 px touch target where space
  permits;
- no separate mobile domain/session implementation.

At 200% browser zoom, switching to Standard or Compact is correct behavior.
Horizontal page scrolling is not.

## 13. Dark, contrast, and reduced-transparency modes

- Dark mode is a designed palette, not an inversion filter.
- Across and Down remain distinguishable in light and dark mode.
- `forced-colors: active` exposes borders, focus, active entry, selected cell,
  and crossing cell through system colors and line styles.
- `prefers-contrast: more` strengthens lines and removes low-contrast texture.
- `prefers-reduced-motion: reduce` removes collapse/selection motion.
- A reduced-transparency preference replaces alpha surfaces with opaque token
  values.
- The faint background `ACROSS` and `DOWN` words may return as static,
  low-opacity field marks. They disappear in high-contrast and compact modes.

## 14. AI-native product surfaces

The design supports local intelligence through four bounded surfaces:

1. **Prepared queue:** “2 originals ready” with no model animation.
2. **Puzzle provenance:** weekday recipe, local generation receipt, household
   profile blend, and content exclusions, inspectable on demand.
3. **Nudge:** replaces the active clue with the next easier grounded clue
   variant and records the assistance locally.
4. **After-solve insight:** one concise observation about vocabulary,
   wordplay, or pacing, with a link to the inspectable evidence.

The primary solve does not display embeddings, profile dimensions, model
confidence, token counts, prompt text, or generation logs.

## 15. Component contract

Luna may change component markup to satisfy semantics, but should preserve
domain boundaries.

### `ClueSpine`

Must receive or derive:

- stable placements;
- active entry;
- affected entries and shared cell IDs from `PuzzleIndex`;
- completion presentation policy;
- density mode;
- independent scroll state.

Required test hooks/semantics:

- `data-direction` on field;
- `data-entry-id` on clue row;
- `data-lane` and `data-row` on placed clue;
- `data-state="active|affected|solved|idle|error"`;
- `data-cell-id` on answer-cell controls;
- accessible label includes number, direction, clue, length, and live pattern.

### `CrosswordGrid`

- exposes active direction as a data attribute;
- retains roving focus;
- does not recompute numbering on each cell render;
- provides stable cell IDs and state attributes for visual testing;
- announces crossing clue context without making every cell a tab stop.

### `ActiveClueBridge`

- replaces the current mobile-only dock concept;
- exists in every layout mode, with different density;
- displays active and selected crossing context;
- owns the nearest Nudge action.

### `SolveCommands`

- remains within the center-stage viewport;
- uses menus for scope escalation;
- never follows the full height of clue content in normal document flow.

## 16. Acceptance criteria

### Visual composition

- At 1920×1080, a 15×15 grid is at least 500 px and is fully visible without
  page scroll.
- Both complete two-lane clue fields and both number seams are visible in the
  first viewport.
- The grid begins no lower than 130 px from the viewport top.
- Puzzle title uses no more than 64 vertical pixels including its metadata.
- Check, Reveal, Nudge, and Pause are reachable without document scrolling.
- No horizontal document overflow occurs at 1920, 1440, 1280, or 200% zoom.

### Functional linkage

- Typing a letter updates the grid, active clue answer cell, and every crossing
  clue answer cell in the same frame.
- Selecting an Across entry gives Across the strong state and marks every
  intersecting Down clue plus its exact shared cell.
- Toggling direction at a crossing swaps strong/affected states without moving
  the selected cell.
- Clicking any clue answer cell selects the matching grid cell and direction.
- Lane and row assignment remain stable when a clue is solved or nudged.
- `collapsed`, `visible`, and `hidden` solved-clue policies behave as specified.

### Accessibility

- Keyboard-only flow covers grid entry, direction toggle, next/previous word,
  clue selection, answer-cell selection, commands, and dialogs.
- Automated axe checks have no serious/critical violations.
- Active, affected, incorrect, revealed, solved, circled, and rebus states have
  non-color cues.
- Forced-colors and reduced-motion screenshots remain intelligible.
- Screen-reader output for a selected cell includes both active and crossing
  clue context.

### Performance and energy

- No continuous animation or model activity during an ordinary solve.
- p95 key-to-paint is below 50 ms on the agreed mid-range reference laptop.
- No interaction long task exceeds 50 ms in the representative typing trace.
- Sixty seconds idle with the visible timer shows no listener growth, no
  unbounded allocations, and CPU close to browser baseline.
- Layout shift is effectively zero while typing and below 0.02 when a clue
  collapses.

### Required visual fixtures

Capture panorama, standard, and compact snapshots for:

1. empty 15×15;
2. active Across with several affected Down clues;
3. active Down with typed crossing letters;
4. check error;
5. half complete with default collapsed clues;
6. long clue and 15-letter answer;
7. rebus + circled + shaded cells;
8. dark mode;
9. forced colors;
10. 200% zoom.

## 17. Luna implementation packages

These packages are intentionally bounded. Agents must not independently
reinterpret the visual direction.

### Luna 1 — visual harness and fixtures

Ownership: component harness/story route and legal visual fixtures only.

- Add representative 15×15 and state fixtures.
- Add panorama/standard/compact harness states.
- Add screenshot names and deterministic session snapshots.
- Do not style the production solver.

Acceptance: every required fixture can be selected by URL or test parameter and
renders deterministically without network or model access.

### Luna 2 — clue topology and linkage

Ownership: clue placement projection, `ClueSpine`, and focused component tests.

- Implement stable lane/row placement.
- Derive affected clues and shared cells from `PuzzleIndex`.
- Add exact answer-cell linkage and completion policies.
- Preserve keyboard and accessible names.

Acceptance: functional-linkage criteria pass in unit/component tests before CSS
is integrated.

### Luna 3 — center-stage composition

Ownership: `App` solver composition, active-clue bridge, and solve commands.

- Remove hero composition from the solver route.
- Keep grid, bridge, and commands in the visible center stage.
- Separate production identity/status from diagnostics.
- Do not change domain or persistence behavior.

Acceptance: unstyled semantic composition meets required regions and command
reachability.

### Luna 4 — visual tokens and CSS

Ownership: solver styles and token definitions only.

- Implement bilateral alignment, semantic states, responsive modes, light/dark,
  contrast, reduced motion, and reduced transparency.
- Avoid filters, perpetual effects, `transition: all`, and component-specific
  magic colors.
- Use the shared harness for all visual decisions.

Acceptance: visual-composition criteria and snapshot matrix pass; idle page has
no continuous paint source.

### Luna 5 — accessibility, visual regression, and energy gates

Ownership: browser tests, axe checks, screenshot baselines, and performance
instrumentation. Production changes are limited to testability/accessibility
defects found by the suite and must be reported.

- Implement keyboard journeys and direction-toggle assertions.
- Add visual baselines for the required fixtures.
- Add forced-color/reduced-motion/zoom coverage.
- Record key-to-paint, long-task, layout-shift, and idle behavior.

Acceptance: publish a concise evidence report with commands, measurements,
failures, and remaining risks.

## 18. Integration order

1. Luna 1 creates the harness and fixtures.
2. Luna 2 and Luna 3 work in parallel on non-overlapping component ownership.
3. Integrate semantic markup and run functional tests.
4. Luna 4 applies the approved visual system against the harness.
5. Luna 5 adds gates and identifies regressions.
6. Review the result against the original legacy screen and this specification,
   not against the current rewrite.

The implementation is complete only when the original clue-spine idea is more
obvious in the refreshed product than it was in the legacy app.
