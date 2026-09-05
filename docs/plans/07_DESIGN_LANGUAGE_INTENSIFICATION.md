# UI Design-Language Intensification Plan

**Status:** implementation-ready design direction
**Scope:** solving, navigation, construction hand-off, light/dark/contrast modes
**Depends on:** [`06_DESIGN_LANGUAGE_REFRESH.md`](./06_DESIGN_LANGUAGE_REFRESH.md)
**Intent:** amplify the product's existing character without redesigning its interaction model

---

## 1. Executive direction

The app already owns a distinctive idea: the crossword is not a grid with a clue list attached. It is one spatial instrument. A stable grid sits between two mirrored clue fields; clue numbers form inner seams; live answer cells expose length and typed crossings before the player moves focus.

That is the product identity. The next visual pass should make it feel authored, inevitable, and unusually refined—not replace it with a conventional newspaper page, dashboard, or collection of translucent cards.

The target design language is **editorial instrument**:

- editorial enough that clue prose feels worth reading;
- instrument-like enough that direction, focus, crossings, progress, and commands are legible at a glance;
- warm and human enough to support a daily ritual;
- restrained enough to run for hours without visual or battery fatigue;
- computational where useful, but never covered in generic “AI” decoration.

The intensification is achieved by increasing five things:

1. **Grid gravity** — the grid becomes the indisputable visual and interaction anchor.
2. **Spine rhythm** — paired clue lanes read as a deliberate bilateral score, not a two-column list.
3. **State precision** — selection, direction, crossings, correctness, and completion form one coherent visual circuit.
4. **Typographic character** — clue prose, answer notation, numbering, and controls each receive an appropriate voice.
5. **Material discipline** — depth, color, motion, and ornament are scarce resources assigned by meaning.

This plan is a refinement layer over the existing specification. It does not reopen settled usability or feature decisions.

---

## 2. What must survive unchanged

These are product invariants, not suggestions:

- The desktop panorama keeps the grid centered between the two clue fields.
- Each direction remains split into two lanes that converge on an inner numbered seam.
- A clue row continues to show its answer shape and already-entered letters without requiring grid inspection.
- Across and Down retain persistent, learnable identities.
- The active clue, its grid entry, its crossings, and its answer notation remain visibly linked.
- Grid, current clues, and primary solve commands remain available without navigation between screens.
- Keyboard-first solving remains first-class; no visual treatment may cause focus movement or scroll jumps on ordinary typing.
- Compact layouts preserve the same information hierarchy even when they cannot preserve the full panorama.
- Existing useful capabilities—checking, reveal, completion, themes, construction, personalization, and puzzle provenance—remain available.
- The interface remains local-first and private by default. AI is part of the product capability, not a reason to make the solve surface resemble a chat client.

If a proposed treatment weakens any of these, it is not an intensification. It is regression.

---

## 3. Current-state diagnosis

This diagnosis is based on the current panorama, night, standard-width, and half-collapsed visual fixtures plus the present legacy stylesheet.

### 3.1 What is already strong

- The three-part desktop silhouette is unique and immediately recognizable.
- Mirrored clue alignment genuinely reduces eye travel between number, prose, answer length, and grid.
- Direction color is structurally useful, not merely decorative.
- The live mini-cells make partially solved entries much easier to reason about.
- The full-bleed active clue bands and seam-side accents are moving toward a coherent system.
- Direction watermarking gives each field an identity at a distance.
- The night mode proves the composition can carry a more atmospheric treatment.

### 3.2 Where the language currently loses authority

1. **The hierarchy has several simultaneous centers.** The title/provenance card, saturated utility strip, pill commands, grid, active clue bands, and enormous direction letters all compete. The grid should win instantly.
2. **Some signals are louder than their information value.** The direction watermarks occupy enormous visual mass while the clue seams—the truly novel navigation device—remain comparatively quiet.
3. **Generic product chrome dilutes the bespoke core.** Rounded cards, diffuse shadows, button pills, gradients, and glossy panels read like a component library around a custom crossword.
4. **The default direction colors feel familiar rather than owned.** Commodity orange and blue communicate correctly but do not yet establish a recognizable palette.
5. **The clue fields alternate between “flowing score” and “boxed controls.”** Borders and active fills are not yet governed by one consistent row grammar.
6. **Typography does not fully distinguish reading from instrumentation.** Clue prose, numbers, answer cells, metadata, and commands need stronger role separation.
7. **Standard width becomes a centered grid with large unused margins.** The fallback is functional, but it loses too much of the app's signature rather than compressing it intelligently.
8. **The stylesheet records successive visual eras.** Later refinements override earlier glow/card rules. That makes future tuning unpredictable and encourages another append-only layer.
9. **There are expensive-looking effects without corresponding meaning.** Blur, repeated shadows, broad gradients, and `transition: all` increase paint and cognitive cost while weakening state semantics.
10. **Construction and AI state still look bolted on.** Their place in the product hierarchy is not expressed by the visual language yet.

### 3.3 The design correction in one sentence

Move visual energy **from ambient decoration and container chrome into geometry, type, seams, and linked state**.

---

## 4. North-star composition

At panorama width, the screen should read in this order within roughly one second:

1. the grid;
2. the active entry crossing the grid;
3. its paired clue row and answer notation;
4. the rest of the clue score;
5. commands and puzzle identity;
6. ambient generation or personalization metadata.

The layout remains bilateral:

```text
ACROSS OUTER FIELD      ACROSS SEAM   GRID / INSTRUMENT   DOWN SEAM      DOWN OUTER FIELD
clue prose + notation       number      cells + controls     number       clue prose + notation
        <---------------- active circuit / crossing circuit ---------------->
```

The seams, not the page edges, are the hinge of the composition. Clue text should feel pulled toward its seam; answer notation should terminate close to it; the seam should visually thread toward the matching numbered cell.

The center column should feel denser and more exact than the clue fields. It is the mechanism. The outer fields may breathe more, but they must never become vague decorative acreage.

---

## 5. The visual grammar

Every visible treatment belongs to one of three layers. This prevents styling from accumulating without purpose.

### 5.1 Structural layer: where things are

Structural styling defines:

- the canvas and three-zone panorama;
- grid boundary and cells;
- the two clue fields and their two lanes;
- inner number seams;
- command and identity rails;
- compact-mode reflow.

It should use neutral tone, spacing, alignment, hairlines, and at most one level of elevation. Structural styling must remain calm when no entry is active.

### 5.2 Semantic layer: what things mean

Semantic styling expresses:

- Across versus Down;
- active entry and selected cell;
- crossing entry;
- typed, checked, incorrect, revealed, and completed states;
- current versus historical/ambient information;
- focus visibility and disabled state.

It may use direction color, weight, opacity, inset marks, and short motion. A semantic signal must never exist only as glow or color.

### 5.3 Atmospheric layer: what the product feels like

Atmosphere includes:

- the paper/ink character of light mode;
- the blue-black/graphite character of night mode;
- restrained direction watermarks;
- subtle static field texture;
- typographic personality;
- celebratory completion treatment.

Atmosphere is optional under reduced motion, forced colors, low-power mode, print, and constrained devices. The interface must retain its full meaning without it.

---

## 6. Signature forms to intensify

### 6.1 The grid monolith

The grid is the only element allowed to carry the page's strongest edge and depth.

- Give the grid one exact outer rule and one restrained cast or contact shadow.
- Make cell rules optically consistent; do not let nested borders produce accidental double weights.
- Keep block cells materially decisive—ink, not “dark gray UI boxes.”
- Use selected-cell treatment inside the cell geometry. Avoid a blurry halo outside it.
- Let the active answer read as a continuous path through related cells while retaining individual cell boundaries.
- Use clue numbers as fine instrumentation: quiet at rest, high-contrast only when relevant.
- Reserve rounded geometry for controls and overlays. The puzzle itself stays square and architectural.

The grid should feel placed on the canvas, not trapped in a card.

### 6.2 The clue score

The clue fields should behave like a musical or editorial score rather than a wall of cards.

- Remove persistent row boxes. Separate rows with rhythm, baseline, and hairlines.
- Treat each pair of lanes as a phrase sharing one vertical beat.
- Align the last line of clue prose and the answer notation toward the seam.
- Keep number columns optically narrow and fixed-width with tabular figures.
- Let active backgrounds run as bands to the field edge so activity reads spatially, not as a floating pill.
- Use completion collapse to expose the score's changing density, but preserve a stable seam and clear restoration target.
- Long clues may wrap; their number and notation must not drift vertically away from the clue's reading block.
- Mini-cells must share the real grid's state vocabulary but at lower visual amplitude.

The clue row is one component with mirrored geometry—not four unrelated alignments patched by selectors.

### 6.3 The number seam

The seam is the app's most ownable visual device and should become more explicit.

- Introduce a quiet continuous seam rule or repeated tick system.
- Seat clue numbers on that rule rather than floating between lanes.
- Increase the active number's scale or weight by one step; do not turn it into a badge.
- Allow the direction color to appear as a short seam segment aligned with the active row.
- Use the seam as the origin for active-row motion and completion compression.
- Preserve exact number positions during typing; only navigation or completion-state change may move them.

The seam should remain useful when the large direction watermark is removed entirely.

### 6.4 The active circuit

Selection is one state projected into several surfaces:

```text
active clue row -> seam number -> answer notation -> grid entry -> selected cell
                                                 -> crossing entry -> crossing clue row
```

There is one strong signal and several echoes:

- **Primary:** the selected cell and active clue row.
- **Secondary:** the rest of the active grid entry and its live answer notation.
- **Tertiary:** the crossing entry and crossing clue row.
- **Ambient:** other occurrences of direction color and watermarking.

The entire circuit must change from a single interaction-state projection. Individual components must not invent their own interpretations of “active.”

### 6.5 The identity and command rails

Puzzle title, provenance, progress, weekday/difficulty, model status, and solve commands should stop reading as stacked generic cards.

- Compress puzzle identity into one quiet typographic rail above the grid.
- Move verbose provenance behind a disclosure or details surface.
- Replace any saturated placeholder/banner treatment with a measured progress or status line.
- Group destructive or exceptional commands—Reveal, Solution, reset—away from the primary solving rhythm.
- Give controls a crisp instrument treatment: explicit borders, small radii, optical pressed states, no diffuse floating shadow.
- Keep the center column vertically stable when metadata or generation status changes.

---

## 7. State intensity ladder

All components use the same ordered ladder. A lower tier may not visually overpower a higher one.

| Tier | Meaning | Permitted treatment |
|---|---|---|
| 0 | Canvas / dormant ornament | neutral tone, faint static texture |
| 1 | Available content | normal ink, hairline structure |
| 2 | Related / crossing | low-chroma tint, weight change, inset mark |
| 3 | Active entry / clue | direction-colored edge plus controlled surface tint |
| 4 | Selected cell / keyboard focus | strongest local contrast, exact inner ring |

Orthogonal truth states overlay the ladder without replacing it:

| Truth state | Required channel | Forbidden shortcut |
|---|---|---|
| Typed, unchecked | glyph + normal cell material | direction color implying correctness |
| Correct after check | small mark or restrained positive accent | filling the entire entry green |
| Incorrect after check | symbol/underline + accessible color | red-only background |
| Revealed | distinct glyph treatment + provenance mark | styling identical to user-entered text |
| Completed | density/quieting change + explicit completion status | celebratory animation that blocks input |
| Keyboard focus | visible inner/outer focus ring | color-only focus |

This ladder must be encoded in tokens and state attributes, not recreated per selector.

---

## 8. Color: own the axes

Across and Down are coordinate axes, not brand accents. Their colors should be recognizable in a one-second peripheral glance and should remain stable across the entire product.

The base palette proposed in the refresh spec is sound:

- **Across:** a warm ember/oxide family around `oklch(0.58 0.16 45)`;
- **Down:** an ink/ultramarine family around `oklch(0.53 0.115 238)`;
- **Light canvas:** warm bone rather than pure white;
- **Night canvas:** blue-black/graphite rather than neutral black;
- **Truth states:** separate success, error, and assist families that cannot be confused with direction.

The intensification rules are more important than the exact starting values:

1. Tune colors in OKLCH so equivalent state tiers have comparable perceived lightness.
2. Direction hue may cover a large area only at low chroma; high chroma is reserved for precise edges, marks, and the selected locus.
3. A surface may contain at most one direction tint at a time. Crossings use a line, split edge, or inset mark rather than muddy orange-blue mixtures.
4. Never use the direction hue to communicate correctness.
5. Night mode receives its own lightness/chroma tuning. It is not a filter or literal token inversion.
6. Watermarks use neutralized direction color and must pass a “remove it and nothing breaks” test.
7. The canvas, grid paper, block ink, and clue fields need a deliberate warm/cool relationship; pure `#fff`, `#000`, Material orange, and Material blue should disappear from authored surfaces.
8. Forced-colors mode uses borders, patterns, and system colors rather than attempting to preserve the brand palette.

### Saturation budget

At rest, no more than roughly 10% of the viewport should contain visibly chromatic surface fill. During active solving, a larger *low-chroma* band is acceptable, but high-chroma color remains localized to the circuit. A screenshot that looks “orange and blue” before it looks “crossword” has exceeded the budget.

### Palette approval artifact

Before broad implementation, produce one route or static fixture with the same active puzzle rendered as:

- light / Across active;
- light / Down active;
- night / Across active;
- night / Down active;
- forced colors;
- simulated common color-vision deficiencies.

Approve the relationships, not isolated swatches. Once approved, freeze semantic token names even if numeric values receive minor tuning.

---

## 9. Typography: prose, notation, instrument

The product needs three voices, each with a narrow job.

### 9.1 Clue prose

Use the editorial serif stack from the refresh spec for clue sentences. It gives compact clues a human reading texture and differentiates them from controls without theatrical newspaper cosplay.

- Optical target: comfortable at 15–18 px depending on viewport and density.
- Line height: approximately 1.22–1.32; enough for scanning, not article reading.
- Avoid forced uppercase, excessive bold, or centered paragraphs on narrow layouts.
- On the left field, preserve the mirrored geometry while keeping multi-line prose naturally readable.
- Font loading must not be required for layout correctness. Prefer high-quality platform faces or a small, locally hosted subset with compatible fallbacks.

### 9.2 Answer notation and cell glyphs

Use a mono or tightly controlled sans face with tabular metrics.

- Mini-cells and grid cells must align predictably for every letter, rebus token, and empty state.
- Letter spacing belongs to the cell geometry, not the text run.
- Typed, revealed, and pencilled/assisted glyphs differ by weight or mark, not font family alone.
- Rebus values scale or abbreviate according to one documented rule.

### 9.3 Instrument labels

Use a neutral UI sans for commands, metadata, difficulty, and status.

- Prefer sentence case for actions and uppercase only for very small categorical labels.
- Use tabular numerals for clue numbers, time, progress, and enumeration.
- Keep metadata quieter than clue prose; de-emphasize by size/contrast before using italics or opacity below accessible thresholds.

### Typographic test strings

The harness must include:

- a one-word clue and a four-line clue;
- punctuation, quotation marks, chemical notation, and diacritics;
- clue numbers `1`, `8`, `11`, `88`, and `100`;
- a 3-letter answer, 15-letter answer, and rebus;
- German-expanded text and 200% browser zoom.

---

## 10. Shape, borders, and depth

The current interface uses too many versions of “soft elevated rectangle.” Replace that with a small material vocabulary.

| Form | Use | Radius | Depth |
|---|---|---:|---|
| Square field | grid and mini-cells | 0–2 px | inner rules only |
| Flowing band | active clue row, status line | 0 px at field edge | tint + seam edge, no shadow |
| Instrument control | buttons, toggles, compact selectors | 4–8 px | border + pressed inset |
| Sheet | settings, construction progress, destructive confirmation | 12–16 px | one restrained elevation |
| Grid monolith | the puzzle | 0–2 px | strongest single page elevation |

Rules:

- No card exists merely to group adjacent text.
- No nested surface gets both a border and a drop shadow unless it is a true overlay.
- Do not use `backdrop-filter` on the solve surface.
- Avoid blur-based state indication. Prefer exact inset rings, edge bars, and tonal steps.
- A maximum of three line weights should cover grid rules, component rules, and focus/selection.
- Watermarks may be large, but should be clipped, low-contrast, static, and subordinate to clue prose.
- The magenta fixture/status band is not a palette candidate; replace it with the semantic status treatment before judging the overall composition.

---

## 11. Motion and temporal behavior

Motion should explain a change of locus or state. The interface must be completely still while the player is thinking.

### Allowed motion

- Selected-cell and active-row transition: 90–140 ms.
- Direction change: a coordinated cross-fade or seam-edge handoff, 120–180 ms.
- Completed-row compression/restore: 140–200 ms, preserving scroll anchor.
- Opening a settings/construction sheet: 160–220 ms.
- Puzzle completion: one finite, interruptible sequence under 900 ms.

### Forbidden motion

- Infinite shimmer, breathing glow, floating particles, animated gradients, or pulsing watermarks.
- Layout animation on every keystroke.
- `transition: all`.
- Smooth scrolling triggered by ordinary letter entry.
- Staggered clue-row entrance on normal app load.
- Animation that delays input, focus, or completion acknowledgement.

### Reduced motion

With `prefers-reduced-motion: reduce`, state changes are immediate except for native focus behavior. No information may rely on an animated path.

### Low-power principle

Static gradients and shadows are permitted only after a paint/profile check. Repeated blur, large translucent layers, filters, and continuously changing composited surfaces are excluded from the default solver.

---

## 12. Responsive behavior: preserve identity by transformation

The app should not become a generic centered crossword merely because the panorama no longer fits.

### 12.1 Panorama: approximately 1280 px and wider

- Preserve both bilateral clue fields and the fixed central grid.
- Let clue fields absorb width before the grid changes size.
- Keep seam numbers close enough to the grid to preserve the visual circuit.
- Utility rails should not increase center-column width beyond the grid without a clear reason.

### 12.2 Standard: approximately 900–1279 px

Use a deliberate **focus-wing** mode:

- Keep the grid central and stable.
- Retain the currently active direction as a compact lateral field or paired rail.
- Make the other direction available through an adjacent tab/rail without changing the current clue or moving the grid.
- Preserve live answer notation in the visible field.
- Avoid large blank margins and avoid placing both entire clue fields far below the fold.

This mode must be tested by interaction, not inferred from one desktop screenshot.

### 12.3 Compact: approximately 600–899 px

- Grid remains the first visual anchor.
- Current clue becomes a persistent strip directly associated with the grid.
- Full clue score opens as an anchored sheet with remembered scroll position.
- Direction switching is explicit and keyboard reachable.
- Answer shape remains visible in the current-clue strip.

### 12.4 Mobile: below approximately 600 px

- Size the grid from the smaller viewport dimension with safe-area support.
- Do not shrink clue text below comfortable reading size to preserve desktop composition.
- Keep current clue and answer notation visible above the keyboard where possible.
- Use sheets for clue browsing, settings, and construction detail.
- Maintain at least 44 CSS px targets for touch controls without inflating grid cells artificially.

Breakpoints are starting points. Final transitions should be derived from component fit using container queries where practical, not device labels alone.

---

## 13. AI and construction: present intelligence, not machinery

LLM support is mandatory product capability, but the solve surface should express its outcome rather than its implementation.

### Before play

Construction may use a dedicated sheet or stage with:

- clear phases: vocabulary preparation, topology/fill search, clue writing, validation;
- determinate progress where the underlying stage exposes real units;
- elapsed time and a truthful cancel action;
- concise recovery choices if local model loading or construction fails;
- a compact explanation of personalization inputs with private/local status.

Do not show token streams, fake confidence meters, terminal-like logs, “AI sparkle,” or anthropomorphic waiting copy as default UI.

### During play

- Puzzle origin and personalization are quiet provenance, one disclosure away.
- A clue may expose why it was selected or adapted only on request.
- Assistance/reveal state is visibly distinct from user knowledge.
- Difficulty adaptation should feel like a well-edited puzzle, not a tutor interrupting every answer.

### After play

- Offer a compact reflection: new vocabulary, clue forms that caused friction, and optional preference feedback.
- Do not turn completion into a dashboard of inferred traits.
- Store personalization signals locally and let the player inspect/reset them.

---

## 14. CSS and component architecture

The redesign must not become one more block appended to `legacy.css`.

### 14.1 First refactoring boundary

Introduce explicit cascade layers:

```css
@layer reset, tokens, base, layout, components, states, themes, utilities, legacy-overrides;
```

During migration, imported files may remain few and coarse:

```text
apps/web/src/styles/
  tokens.css       semantic color, type, spacing, shape, motion
  base.css         document defaults and accessibility primitives
  solver-layout.css
  grid.css
  clue-spine.css
  controls.css
  overlays.css
  themes.css
```

This is a dependency direction, not a mandate for dozens of tiny files. Components consume semantic tokens; themes supply token values; state selectors alter semantic tokens or narrow properties. Themes must not know component DOM structure.

### 14.2 Component boundaries

Extract or formalize these view responsibilities:

- `SolverFrame`: responsive composition and rails;
- `Grid`: cell geometry and projected cell states;
- `ClueField`: direction field and two-lane layout;
- `ClueRow`: prose, notation, number relationship;
- `AnswerPattern`: miniature cell rendering from the same state vocabulary as the grid;
- `PuzzleIdentityRail`: title, origin, weekday/difficulty, compact progress;
- `SolveCommandRail`: primary and exceptional commands;
- `ConstructionSheet`: model/construction lifecycle only.

Keep interaction/application logic out of style components. The application layer produces a serializable presentation state; the view projects it consistently.

### 14.3 Selector rules

- Prefer component classes and semantic attributes such as `data-direction`, `data-active`, `data-crossing`, `data-entry-state`, and `data-complete`.
- Remove positional styling such as broad `nth-child` rules where DOM placement is standing in for domain meaning.
- Keep selector specificity flat; no IDs for visual styling.
- State selectors modify only the properties needed for that state.
- Do not use `!important` except for documented accessibility/user-preference overrides.
- Do not encode color literals outside token/theme definitions.

### 14.4 Migration method

1. Record computed styles and screenshots for the fixture matrix.
2. Create tokens and cascade order with intentionally zero visual change.
3. Move one owned surface at a time from legacy to authored CSS.
4. Delete the superseded legacy rules in the same slice.
5. Run state, interaction, accessibility, visual, and energy checks.
6. Commit that slice before starting the next surface.

The measure of progress is deleted ambiguity, not added CSS.

---

## 15. Implementation sequence and gates

### Phase 0 — freeze the behavioral contract

**Deliverables**

- Capture the current interaction map for mouse, keyboard, direction switching, clue selection, collapse, check, reveal, completion, and resume.
- Expand the visual harness to cover all meaningful states listed in Section 16.
- Add measured baselines for layout shift, key-to-paint latency, idle rendering, CSS size, and contrast.

**Gate:** no design work begins until a broken behavior or visual state can be named by a stable fixture.

### Phase 1 — style tiles and token lock

**Deliverables**

- Render palette/type/line/depth combinations in light, night, and forced colors.
- Select one authored direction pair and neutral family.
- Freeze semantic token names and document contrast pairs.

**Gate:** approve a full active-circuit composition, not a mood board.

### Phase 2 — remove competing chrome

**Deliverables**

- Compress identity and command areas into rails.
- Eliminate the saturated placeholder/status strip.
- Give the grid the only strong page elevation.
- Remove redundant cards, blurs, and broad shadows.

**Gate:** in a five-second test, reviewers identify grid, current clue, and current answer before metadata or ornament.

### Phase 3 — build the clue score and seams

**Deliverables**

- Implement the shared mirrored `ClueRow` geometry.
- Establish paired vertical rhythm and stable number seams.
- Unify mini-cell shapes and typed/revealed states.
- Tune long-clue wrapping and completion compression.

**Gate:** clue numbers and answer notation do not jump on typing, crossing changes, or ordinary navigation.

### Phase 4 — connect the active circuit

**Deliverables**

- Produce one presentation-state projection for grid, active clue, crossing clue, and mini-cells.
- Implement the tier ladder and truth-state overlays.
- Add restrained direction handoff and reduced-motion behavior.

**Gate:** every active visual mark can be traced to one state meaning; no contradictory highlights exist.

### Phase 5 — responsive identity

**Deliverables**

- Implement and validate panorama, focus-wing, compact, and mobile modes.
- Preserve current clue, answer shape, and keyboard focus through mode transitions.
- Test resize, zoom, virtual keyboard, and orientation change.

**Gate:** no supported width degenerates into unexplained blank space or sends essential clues below a large dead zone.

### Phase 6 — AI/construction integration

**Deliverables**

- Replace generic blocking generation UI with a bounded `ConstructionSheet`.
- Represent real lifecycle state, cancellation, failure recovery, and local/privacy status.
- Integrate quiet provenance and post-solve reflection.

**Gate:** an offline/model failure leaves the application usable and explains the next valid action without exposing implementation noise.

### Phase 7 — subtraction and hardening

**Deliverables**

- Delete superseded legacy CSS and dead visual variants.
- Run accessibility, browser, visual, performance, energy, and mutation suites.
- Perform one manual long-session solve in light and night modes.

**Gate:** every remaining exception is documented; there is no “temporary” third design system hiding in overrides.

---

## 16. Required visual and interaction matrix

Every fixture is captured in light and night mode unless the row says otherwise.

| Area | Required fixtures |
|---|---|
| Viewports | 1440×900, 1920×1080, 1280×720, 1136×900, 1024×768, 768×1024, 390×844 |
| Direction | Across active, Down active, direction flip at crossing |
| Entry | empty, partially typed, complete unchecked, checked correct, checked wrong, revealed |
| Clues | short, four-line, 15-letter pattern, rebus, circle/shade metadata, punctuation/diacritics |
| Progress | fresh, half complete, completed rows collapsed, puzzle complete |
| Navigation | selected by grid, selected by clue, keyboard Tab, arrow movement, restored session |
| Utility | command focus, confirm sheet, settings sheet, construction progress, model error |
| Accessibility | 200% zoom, reduced motion, increased contrast, forced colors, keyboard only |

Visual snapshots are evidence, not acceptance by themselves. Each changed snapshot requires a short intent note: what changed, why it is better, and which invariant remains protected.

---

## 17. Quality and energy budgets

Initial budgets should be recorded against current measurements, then tightened rather than guessed. The following are release ceilings:

- Zero continuous animations during an idle solve.
- Zero `transition: all` in authored solver CSS.
- Zero `backdrop-filter` in the default solve surface.
- No new font or image request without a documented size, privacy, and layout-shift justification.
- CSS gzip size should remain below 7.5 KiB unless an explicit budget change is approved; removal of legacy rules should offset most additions.
- No visible layout shift when fonts resolve, generation status changes, a clue completes, or answer notation updates.
- Keydown-to-visible-cell update p95 below 50 ms on the agreed mid-tier reference device.
- Direction switch and clue selection must remain responsive under 4× CPU throttling.
- All normal text and state combinations meet WCAG AA contrast; essential grid/focus boundaries remain identifiable in forced colors.
- A 30-minute idle profile shows no periodic painting or scripting caused by decoration.

Add automated guards for forbidden properties/selectors and a small computed-style contract test for the state ladder. Use browser traces for latency/energy claims; do not infer performance from visual simplicity.

---

## 18. Parallel implementation packages

These packages are intentionally separated by ownership. Agents are not alone in the repository: each must preserve unrelated edits, stage only owned files, and avoid rewriting another package's surface.

### Package A — visual harness and baselines

**Owns:** `apps/web/e2e/`, harness fixtures, visual/performance documentation.
**Produces:** the matrix in Section 16, baseline metrics, screenshot review template.
**Does not own:** production solver CSS.

### Package B — tokens and cascade

**Owns:** token/theme/base style files and the controlled import order.
**Produces:** semantic tokens, cascade layers, contrast tests, literal-color inventory.
**Does not own:** component layout or React behavior.

### Package C — center instrument

**Owns:** `LegacyGrid` migration, center layout, identity rail, command rail, grid-focused styles/tests.
**Produces:** grid monolith and compressed chrome.
**Does not own:** clue field geometry.

### Package D — clue score

**Owns:** `ClueColumn`/`ClueField`, `ClueRow`, `AnswerPattern`, seam styles and fixtures.
**Produces:** stable mirrored lanes, typography, mini-cell state parity, completion compression.
**Does not own:** application state calculation.

### Package E — presentation state and accessibility

**Owns:** pure projection from solver/application state to view state, keyboard/focus contracts, state tests.
**Produces:** one active-circuit model and truth-state overlays consumed by Packages C/D.
**Does not own:** aesthetic token values.

### Package F — responsive composition

**Owns:** `SolverFrame`, container-query modes, mobile/current-clue sheet, resize fixtures.
**Produces:** panorama, focus-wing, compact, and mobile transformations.
**Starts after:** Packages C and D expose stable component contracts.

### Package G — construction surface

**Owns:** construction/model lifecycle presentation, progress/cancel/error UI and tests.
**Produces:** `ConstructionSheet` and quiet solve-time provenance.
**Does not own:** worker/search behavior beyond consuming its public lifecycle contract.

### Package H — subtraction and performance

**Owns:** legacy-rule deletion, unused-style verification, trace/bundle/energy gates.
**Produces:** CSS delta report, forbidden-effect linting, long-session validation.
**Starts after:** each migrated surface, not only at the end.

Each package should land as small vertical slices with its fixture and deletion in the same change. Do not run all packages against `legacy.css` concurrently.

---

## 19. Review rubric

Review each slice from 0–2 on each axis; a slice needs at least 13/16 and no zero to land.

| Axis | 0 | 1 | 2 |
|---|---|---|---|
| Identity | generic or erases a signature | recognizable | unmistakably this product |
| Hierarchy | competing centers | mostly clear | grid → active circuit → score is immediate |
| State precision | ambiguous/contradictory | understandable | exact across every linked surface |
| Typography | one undifferentiated voice | role hints | prose/notation/instrument roles are clear |
| Restraint | effect-led | some excess | every visual resource has a job |
| Accessibility | regression | equivalent | improved beyond baseline |
| Responsiveness | layout merely fits | usable | identity transforms coherently |
| Energy | continuous/expensive work | neutral | simpler and measurably cheaper |

Reviewers should answer four questions in prose:

1. What became easier to perceive or do?
2. Which part now feels more authored?
3. Which effect could still be removed with no loss of meaning?
4. What evidence shows that keyboard, compact, contrast, and energy behavior survived?

---

## 20. Definition of done

The intensification is complete when:

- The bilateral clue score and number seams are as visually characteristic as the grid.
- The current answer can be located from clue field or grid without searching.
- Grid, active clue, answer notation, and crossing clue always agree.
- The huge direction watermark is optional atmosphere rather than structural compensation.
- The center contains no unexplained saturated banner or stack of generic cards.
- Across and Down have an owned, accessible palette in light and night modes.
- Clue prose, answer notation, numbers, and controls have distinct typographic roles.
- Standard, compact, and mobile layouts preserve the same task hierarchy.
- Construction/AI lifecycle is truthful, cancellable, quiet, and visually integrated.
- Solver CSS has one explicit cascade, semantic tokens, flat state selectors, and materially less legacy ambiguity.
- Visual, interaction, accessibility, performance, and energy gates pass.
- A full Wednesday/Thursday-length solving session feels calmer at minute 30 than the current version while being more vivid at the active locus.

---

## 21. Explicit anti-goals

Do not ship:

- a generic NYT visual clone;
- a dashboard of cards around the puzzle;
- glassmorphism, neon fog, or glow as the primary focus language;
- oversized AI badges, chat bubbles, token counters, or model-brand theatre;
- ornamental animation during thought time;
- a mobile layout obtained by simply stacking every desktop region;
- CSS that relies on specificity escalation to defeat the previous design era;
- a palette change without linked-state and contrast proof;
- a screenshot-perfect change that worsens keyboard flow, scrolling, battery use, or long-session comfort.

---

## 22. First implementation brief

The first implementation slice should be deliberately small and decisive:

1. Add the full state fixture matrix without changing production appearance.
2. Establish cascade layers and semantic tokens with zero intended visual diff.
3. Replace the saturated status strip and stacked center chrome with the quiet identity/command rails.
4. Give the grid the single strongest material boundary.
5. Delete the superseded legacy rules and measure the result.

Only after that slice passes should agents tune the clue score and active circuit. This order reveals the real composition by removing noise first, and it gives every subsequent visual decision a stable token and test foundation.

The intended result is not “more styling.” It is a stronger visual argument: **two clue fields converge through numbered seams onto one precise grid, and every mark helps the player think.**
