# Legacy vs Remake Solver Feature Audit

**Status:** complete first-pass behavioral audit with running-browser evidence

**Compared implementations:** Vue legacy solver in `src/crossword/` and React remake in `apps/web/`

**Reference policy:** legacy behavior is the baseline unless the owner explicitly prefers a remake improvement

**Implementation scope:** none; this document specifies and diagnoses behavior

---

## 1. Purpose

The remake is not yet a faithful upgrade of the solver. It reproduces much of the legacy markup and stylesheet, but several high-frequency interactions have changed semantics. These are especially damaging because the original solver is already present in the repository and should function as an executable behavioral specification.

This audit separates four things that have been conflated:

1. **Legacy fact** — what the original code and rendered application actually do.
2. **Remake fact** — what the React/domain implementation actually does.
3. **Owner decision** — where the intended product deliberately differs from either implementation.
4. **Target contract** — the behavior agents must implement and test.

“Legacy replica” comments or visual snapshots are not proof of parity. A parity claim requires an interaction-level differential test or an explicit owner-approved change.

---

## 2. Evidence hierarchy

Use evidence in this order:

1. owner-observed behavior and explicit owner decision;
2. side-by-side interaction in the running legacy and remake applications;
3. legacy implementation plus characterization test;
4. remake implementation plus unit/E2E test;
5. screenshot or computed-style measurement;
6. comments, ADR claims, and names such as `LegacyGrid` or “exact replica.”

The lower levels cannot overrule an owner correction. In particular, ADR 0003's byte-equal watermark claim records an earlier conclusion; the owner has now explicitly said the rendered words are unreadably large. That decision must reopen the visual contract and its golden test.

---

## 3. Severity and parity labels

| Label | Meaning |
|---|---|
| P0 | breaks the core typing/checking loop or corrupts player feedback/score |
| P1 | materially damages navigation, clue continuity, legibility, or trust |
| P2 | incomplete parity or polish issue that does not block ordinary solving |
| Legacy parity | target should match the legacy behavior |
| Owner override | target intentionally improves or corrects legacy behavior |
| Remake retain | remake already contains an improvement worth preserving |

---

## 4. Executive findings

### P0 — clicking a Down clue can be overwritten back to Across

This is a verified state/focus race, not a styling illusion.

- The remake's `handleSelectEntry` selects the entry with `entry.direction`, then immediately calls `focusInput` (`apps/web/src/App.tsx:206-211`).
- Focusing the input triggers its `onFocus`, which calls `handleSelectCell` (`LegacyGrid.tsx:152-153`).
- That callback can still see the render's previous direction. If the focused cell also belongs to an Across entry, `handleSelectCell` preserves Across and schedules a second selection (`App.tsx:193-203`).
- The second update can therefore clobber the explicit Down selection.
- The legacy clue handler sets `direction`, `activeClueNumber`, and `activeDirection` together before focusing (`src/crossword/static/main.js:861-875`).

**Target:** an explicit clue or pattern click is authoritative. Focus synchronization must never reinterpret its direction. Clicking a Down clue yields a Down selection before and after focus settles; the next letter advances Down.

**Required regression:** click a Down clue whose chosen open cell is a crossing with an Across entry, type two letters, and assert both land vertically.

### P0 — empty cells are presented as correct after Check

- `checkSession` correctly excludes empty cells from `incorrectCellIds`.
- It incorrectly adds **every cell in the scope**, including empty cells, to `checkedCellIds` (`packages/domain/src/session.ts:393-406`).
- Both grid and clue mini-cells render any checked cell that is not incorrect as green (`LegacyGrid.tsx:116-121`, `ClueColumn.tsx:92-99`).
- Therefore an empty cell becomes visually “correct.”
- The legacy checker explicitly removes both red and green classes for an empty input (`main.js:628-631`).

**Target:** Check partitions cells into `correct-entered`, `incorrect-entered`, and `empty`. Empty remains neutral. There is no boolean shortcut in which “not incorrect” means correct.

### P0 — Check is no longer a mode toggle

- Legacy behavior: if check mode is already active, pressing Check calls `clearChecks()` and returns without another check or counter increment (`main.js:605-612`).
- Remake behavior: every press calls `checkSession`, records another `checked` event, updates marks, and forces `checking = true` (`App.tsx:243-248`).

**Target:** Check is a visible two-state control.

- Off → On: evaluate the chosen scope once and enter check mode.
- On → Off: hide check feedback without evaluating again, incrementing usage, or changing score.
- The button label or pressed state must reveal which action will occur.

### P0 — repeated harmless checks lower the remake score

- Legacy starts at 100, increments `checksUsed` when entering check mode, and deducts 10 points only if at least one non-empty value is wrong (`main.js:611-655`). Empty cells alone do not trigger a penalty.
- Remake derives score as `100 - 5 × checked-event count - 10 × reveal-event count` (`App.tsx:189-191`). It penalizes every Check press, including a repeated press with no mistake and the press that should merely exit check mode.

**Target:** score changes only for a defined assistance/error event, never for displaying or hiding existing feedback. Repeated Check with unchanged correct/empty state is idempotent for score.

The final score formula requires an explicit product contract; event counts must not be used as a convenient proxy.

### P0 — editing destroys the entire check context

- Remake `handleEnter`, `handleEnterRebus`, and `handleClear` all call `setChecking(false)` before changing one cell (`App.tsx:220-232`).
- The owner explicitly rejects clearing check mode on deletion: it removes the map of which other wrong cells still need attention.
- Legacy letter entry clears all checks, but Backspace does not call `clearChecks` (`main.js:1045-1063`). This legacy asymmetry explains the expected deletion workflow but is not sufficient as a clean target model.

**Owner override target:** check mode persists during correction.

- Deleting one wrong cell neutralizes only that cell; other known-wrong cells remain marked.
- Typing into a marked cell updates that cell according to a documented policy without hiding the other errors.
- A new **Clear incorrect** action may empty all currently known-wrong cells in one operation while remaining in check mode.
- Exiting check mode remains an explicit Check-button toggle.

### P1 — clues disappear when merely filled, before correctness is known

- Legacy template hides only entries in `completedWords` (`newapp.html:22,248`). That set is updated by Check only when every character is correct (`main.js:644-649`).
- Remake `ClueColumn` filters out an entry when every cell contains any truthy value (`ClueColumn.tsx:19-20,60`). A fully wrong answer disappears immediately.
- Remake `solvedCount` and the `half-completed` layout threshold use the same filled-not-solved definition (`App.tsx:184-188`).

**Target:** typing alone never removes a clue. “Filled,” “verified correct,” and “collapsed/hidden” are separate states.

Recommended owner-aligned policy:

1. a filled unchecked clue stays fully visible;
2. a checked-wrong clue stays visible with localized errors;
3. a verified-correct clue becomes eligible for compacting only after a short stable state or check-mode exit;
4. compacted clues remain recoverable for review;
5. layout density is based on verified completion, not non-empty cells.

### P1 — the useful first-open-cell behavior should be retained

- Legacy clue click always focuses the entry's first cell (`main.js:869-874`).
- Remake clue click chooses the first empty cell and falls back to the first cell when none is empty (`App.tsx:206-208`; `session.ts:267-284` uses the same rule for entry stepping).
- The owner explicitly likes this behavior: if the first letter is already filled, clicking the clue should land on the next open letter.

**Target:** retain the remake improvement. Selection must use the first open cell in clue order while honoring the clicked clue's direction. This must not be lost when fixing the Down-direction race.

### P1 — the added spine-edge treatment is not legacy behavior and is structurally unstable

- The remake stylesheet is the 2,029-line legacy stylesheet plus an appended “Spine refinement (phase 2)” block.
- That block adds orange/blue 3 px inset edges to both active and affected clue rows (`apps/web/src/legacy.css:2092-2109`). The legacy stylesheet has no equivalent rule.
- Edge placement is based on `:nth-child(odd/even)` of the **currently visible** rows. Because rows are removed as they become merely filled, later rows change parity and the colored edge can flip sides during play.
- An affected clue in the Down column receives a blue edge even when the active circuit originated from Across. This mixes “column identity,” “active direction,” and “crossing relation” into one unexplained signal.

**Target:** remove the phase-2 inset edges until a semantic seam treatment is specified. If an edge returns, its side must come from stable lane placement data and its color from an explicit state projection—not filtered DOM position.

### P1 — the Across/Down background words are contractually wrong despite an exact-style test

- The remake test locks `font-size: 240px`, `opacity: 0.45`, and orange color for the active watermark at 1440 px (`apps/web/e2e/highlights.spec.ts:58-70`).
- Commit `ea412e4` describes that as byte-identical to the running legacy app.
- The owner now reports that the words are unreadably large and do not render correctly. Current screenshots corroborate that they dominate and fragment into giant letterforms behind the clue fields.
- The current watermark is also a single vertically written word, not a subtle field label; its visual mass can obscure clue-row state.

**Owner override target:** preserve the concept, not the frozen pixels.

- The full word must be recognizable as `ACROSS` or `DOWN` at the intended panorama viewport.
- It must remain subordinate to every clue and answer cell.
- It may not create a false highlight, reduce text contrast, or extend beyond its clue field.
- Size should respond to the field's container dimensions, with a maximum based on available field width/height rather than viewport width alone.
- Replace the exact `240px` assertion with bounding-box, legibility, containment, contrast, and screenshot contracts.

### P1 — primary control labels are not reliably legible

The stylesheet applies overlapping control systems:

- `.action-button` defines themed text/backgrounds;
- later `.menu-section button` rules override size, background, and text color;
- light mode applies still later overrides;
- a large expanding `button::after` pseudo-element is painted after the label without an explicit content stacking contract (`styles.css:540-578`);
- labels use small uppercase text with wide tracking.

This cascade makes “looks okay in one screenshot” an insufficient test. The owner reports the current labels as unreadable.

**Target:** visible text labels remain the top paint layer, meet WCAG AA contrast in every theme/state, remain readable at 200% zoom, and do not depend on `title` or icon recognition. The action name should be sentence case unless space evidence requires otherwise.

---

## 5. First parity ledger

| Capability | Legacy | Remake | Target | Priority |
|---|---|---|---|---:|
| Click Across clue | selects Across + first cell | selects first open, usually Across | first open + authoritative Across | P0 |
| Click Down clue | selects Down + first cell | can be overwritten to Across by focus | first open + authoritative Down | P0 |
| Click answer mini-cell | focuses exact cell in entry direction | intended, subject to same focus race | exact cell + authoritative clicked direction | P0 |
| Click selected crossing grid cell | legacy focus behavior; direction changed by arrows | early-return prevents click-to-toggle | specify explicit repeated-click toggle separately | P1 |
| Type a letter | writes and advances in active direction | writes and advances | retain, after direction fix | P0 |
| Click clue with earlier filled cells | goes to first cell | goes to first open cell | retain remake improvement | P1 |
| Filled unchecked entry | stays visible | disappears | stays visible | P1 |
| Correct checked entry | disappears via `completedWords` | already disappeared when filled | compact only under explicit policy; recoverable | P1 |
| Check empty cell | neutral | green | neutral | P0 |
| Press Check while off | evaluates and enters mode | evaluates and enters mode | evaluate once, enter mode | P0 |
| Press Check while on | exits mode, no new count | rechecks and adds event | exits mode, idempotent score | P0 |
| Delete during check | does not explicitly clear mode | clears all feedback | keep mode and other errors | P0 |
| Type correction during check | clears all checks | clears all checks | update local cell; preserve other errors | P0 owner override |
| Score on erroneous check | −10 once per check-mode entry | −5 per Check event | explicit penalty contract; no repeated penalty | P0 |
| Score on no-error check | no loss | −5 | no loss | P0 |
| Check count | count of check-mode entries | count of checked events | count evaluations, not toggle-off | P1 |
| Clear all known errors | absent | absent | add `Clear incorrect` while checked | P1 owner addition |
| Active/crossing clue tint | direction-linked fills | copied fills + extra seam edges | one coherent active circuit | P1 |
| Watermark | giant legacy rendering | byte-copied and golden-locked | responsive, contained, subordinate | P1 owner override |
| Button text | legacy cascade | same cascade in different DOM/context | explicit contrast/stacking contract | P1 |

---

## 6. Immediate correction order

1. Fix selection authority and add the Down-clue vertical typing regression.
2. Model check results as a three-way cell state; prevent empty green cells.
3. Restore Check toggle semantics and score idempotence.
4. Preserve the error set through per-cell corrections and add Clear incorrect.
5. Separate filled, verified, and compacted clue states.
6. Remove the unstable phase-2 spine edges.
7. replace the watermark golden constant with responsive semantic assertions.
8. flatten the control-label cascade and add computed contrast/stacking tests.

Do not begin another visual-intensification pass until items 1–5 are protected. A more beautiful surface cannot compensate for a solver that changes direction, hides unresolved clues, or lies about correctness.

---

## 7. Downstream specification artifacts

This audit is the evidence record. Implementation decisions and agent ownership live in separate incremental artifacts so that findings are not blurred with proposed code structure:

- [`../plans/09_SOLVER_INTERACTION_CONTRACT.md`](../plans/09_SOLVER_INTERACTION_CONTRACT.md) defines the normative interaction state machines and release journeys.
- [`../plans/10_SOLVER_PARITY_REMEDIATION_HANDOFF.md`](../plans/10_SOLVER_PARITY_REMEDIATION_HANDOFF.md) assigns non-overlapping work packages, test layers, mutation targets, and acceptance gates.

Further browser discoveries should be appended to Section 8 with the exact action sequence and observed state. New owner decisions belong in the handoff's append-only Decision log and, when they change a product invariant, in the interaction contract.

---

## 8. Running-browser evidence checkpoint

The following probes were performed against the current working tree on 2026-09-03 using the real React application at `localhost:5173`. They are deliberately recorded as action → rendered result, not inferred from source.

| Probe | Rendered result | Contract result |
|---|---|---|
| Press Check on a mostly empty puzzle | first untouched empty input had class `green`; Checks `1`; Score `95` | FAIL: empty is not correct; harmless check was penalized |
| Press Check a second time without editing | empty remained `green`; Checks `2`; Score `90` | FAIL: did not exit; duplicate penalty |
| Start with Down active, click a different Across clue, type four letters | `body[data-active-direction]` remained `down`; letters landed vertically in column 0 | FAIL: explicit clue direction was clobbered by prior direction |
| Fill the remaining cells of 1-Across with wrong letters | Across clue count changed `41 → 40`; 1-Across disappeared | FAIL: filled was treated as complete |
| Check a state containing nine wrong cells, then Backspace one | red count changed `9 → 0`; green count also `0` | FAIL: one edit destroyed the whole check context |
| Targeted current E2E run | highlight, responsive, and workflow files reported `14 passed` | TEST GAP: green suite does not imply behavioral parity |

The direction bug is symmetric: the previous direction can win over either an Across or Down clue click when focus lands on a crossing cell. A test that clicks the first Down clue from the initial first Across cell can pass because the chosen cell is already selected and the second handler returns early. The regression test must start in the opposite direction and select a **different crossing cell**.

---

## 9. Complete solver capability ledger

Disposition values:

- **Match** — reproduce the useful legacy contract.
- **Keep remake** — preserve a verified remake improvement.
- **Owner override** — implement the owner's updated direction.
- **Replace** — retain the capability but with the new architecture/product boundary.
- **Retire** — do not bring the legacy mechanism into the deployable product.
- **Defer** — preserve knowledge but do not block core solver parity.

### 9.1 Selection, focus, and typing

| Capability | Legacy desktop | Current remake | Target disposition |
|---|---|---|---|
| Initial direction | Across | Across in a unified selection | Keep remake |
| Initial selected entry/cell | no complete semantic selection until clue interaction | first Across entry/cell selected | Keep remake |
| Grid-cell click | native input focus; does not derive active clue | selects a cell while retaining valid direction | Keep remake, add explicit crossing toggle |
| Click selected crossing cell | no reliable toggle contract | early return; no toggle | Owner target from product spec: toggle direction |
| Click clue | sets clue direction and first cell | first open cell, but focus race can restore prior direction | Keep first-open improvement; fix authority P0 |
| Click answer mini-cell | exact grid position and entry direction; active-clue state may remain stale | exact cell and entry direction, subject to focus race | Keep remake after authority fix |
| Type Latin letter | uppercase and move forward | uppercase and move forward | Match |
| Overwrite occupied cell | replaces and moves | replaces and moves | Match |
| Move after letter | next cell in current entry | next cell in selected entry | Match |
| Type at entry end | stays unless completed entry triggers next-word logic before move | stays on final cell | Match legacy next-open-entry behavior after a verified test |
| Auto-jump after filled entry | if moving forward out of a fully filled word, focuses next same-direction entry | not implemented in the bound UI | Match, selecting first open cell of next entry |
| Backspace | clears current and moves backward | clears current and moves backward | Match, with check-context fix |
| Arrow parallel to direction | moves along grid; skips black cells recursively | moves one coordinate; a black/outside target leaves selection in place | Specify entry-relative navigation and test boundaries |
| Arrow orthogonal to direction | changes direction and stays on cell | changes direction and stays on crossing cell | Match where both directions exist |
| Direction change where no orthogonal entry exists | mutable direction may still change, creating state drift | `chooseDirection` falls back to valid entry | Keep remake |
| Space direction toggle | only repurposed for legacy rebus cells | not bound | Add explicit tested toggle; rebus command must remain available |
| Tab / Shift+Tab | browser-native focus order | browser-native order across hundreds of inputs/controls | Replace with next/previous entry composite navigation |
| Paste/IME/dictation | no deliberate support | `onChange`/paste path exists | Keep remake and expand composition/mobile tests |
| Paused typing | no pause feature | ignored by domain while paused | Keep remake |

### 9.2 Clue fields and linked answer notation

| Capability | Legacy desktop | Current remake | Target disposition |
|---|---|---|---|
| Across/grid/Down panorama | present | present | Match as product invariant |
| Two lanes per direction | flex wrap + `nth-child` | same mechanism | Replace with stable lane/row projection |
| Number seam | emergent odd/even geometry | same plus added inset edges | Preserve geometry; remove unstable edge |
| Clue answer length | one mini-cell per answer position | same | Match |
| Entered crossing letters | reflected in every linked mini-cell | same | Match |
| Active clue highlight | set only after clue click | derived from unified selection after grid/clue actions | Keep remake |
| Crossing clue highlight | affected clue + exact shared mini-cell | same computation from stable IDs | Keep remake |
| Active direction field identity | watermark class follows mutable `direction` | follows unified selection direction | Keep remake state source; redesign watermark |
| Filled unchecked clue | remains | removed | Owner override: remains |
| Checked-wrong clue | remains | was already removed if filled | Owner override: remains |
| Checked-correct clue | removed | removed as soon as filled | Replace with reversible compact/collapse state |
| Clue spatial stability | removing `completedWords` changes `nth-child` lanes | removing filled entries changes lanes and inset-edge side | Replace with stable placement |
| Half-complete density change | after >50% verified `completedWords`; font grows | at ≥50% merely filled; font grows | Base only on verified completion; reconsider font jump |
| Scrollbars | hidden | hidden | Make overflow discoverable and active clue programmatically visible |
| Clue keyboard activation | pointer only | each row and mini-cell independently tabbable | Improve to roving/composite navigation; avoid hundreds of stops |
| Watermark | large vertical letters, strong active opacity | exact copied values locked by test | Owner override: responsive, contained, subordinate |

### 9.3 Checking and correction

| Capability | Legacy desktop | Legacy role/mobile client | Current remake | Target |
|---|---|---|---|---|
| Check as mode | first press evaluates; second clears marks/exits | first enters live check; second clears wrong values and exits | every press evaluates; never toggles off | desktop toggle plus explicit error-clean action |
| Empty result | neutral | neutral | green | neutral |
| Correct entered result | green | green | green | accessible confirmed state |
| Incorrect entered result | red | red | red | accessible incorrect state |
| Edit one checked cell | letter clears all checks; Backspace leaves mode | check mode remains until action | any type/delete clears all checks | preserve other error feedback during correction |
| Clear all wrong cells | absent | built into `Clear Errors` second press | absent | add explicit `Clear incorrect` action |
| Mark correct entries | `completedWords` on check | `solvedKeys` during Clear Errors | no verified-entry state; checked cells only | first-class verified entry IDs |
| Check scope | whole puzzle only | current role entries | domain supports cell/entry/puzzle; UI only puzzle | expose scopes deliberately, starting with puzzle parity |
| Repeated unchanged check | toggle-off, no new evaluation | action semantics differ | duplicate event and penalty | idempotent toggle-off |
| Error persistence across reload | none | room state only, not error state | incorrect IDs are component-local and lost; checked IDs persist | specify session persistence for latest evaluation |

The owner's proposed “button that cleans the incorrect ones” is not speculative: the legacy role/mobile client already contains `clearIncorrectAndMarkSolved()` and labels its second check-state action **Clear Errors** (`src/crossword/static/mobile.js:32-88`). The remake should recover this useful behavior without inheriting the separate mobile architecture.

### 9.4 Score, counters, and assistance

| Event | Legacy rule | Current remake rule | Parity target |
|---|---:|---:|---:|
| Start | 100 | 100 | 100 |
| Enter check mode with ≥1 wrong filled cell | −10 | −5 for any Check event | −10 once |
| Enter check mode with only correct/empty cells | 0 | −5 | 0 |
| Exit check mode | 0, no counter increment | impossible; another −5 | 0 |
| Re-enter unchanged state with no errors | 0 | −5 | 0 |
| Reveal one empty ordinary cell | −20; `revealsUsed +1` | no bound cell-reveal UI | restore as explicit action or defer deliberately |
| Reveal all | −50 flat; counter increases per newly filled cell | −10 because one reveal event | −50 for initial parity |
| Reveal already filled cell | right-click does nothing | no cell action | no score change |
| Check counter | number of evaluations/entries into check mode | number of `checked` events including repeated presses | number of real evaluations only |
| Reveal counter | number of previously empty cells revealed | number of reveal events | choose and label one unit; legacy parity is cells |
| Completion history score | stored and displayed | not stored in solved-list record | restore score snapshot if score remains a product feature |
| Celebration tier | derived from score | no score-tier celebration | Defer; use bounded motion/sound preferences |

**Initial parity rule:** use the legacy formula exactly until a separately approved scoring redesign exists. Do not improvise penalties from event counts. A later learning model may record richer neutral telemetry, but that is not the player-visible score.

### 9.5 Reveal and rebus behavior

| Capability | Legacy desktop | Current remake | Target disposition |
|---|---|---|---|
| Reveal entire puzzle | confirmation, fill solution, −50, count empty cells, mark solved | confirmation, fill solution, one assist event, derived −10 | Match legacy player contract; retain typed event model |
| Reveal one normal cell | right-click empty cell, no confirmation, −20 | browser context menu; no reveal | Replace hidden gesture with explicit cell/entry action |
| Reveal entry | absent | domain supports but no UI | Add with proportionate confirmation/penalty policy |
| Rebus entry | Space/right-click opens authored menu | right-click opens `window.prompt` | Restore authored accessible editor; also bind keyboard/touch |
| Rebus validation | 1–10 chars via input maxlength | domain validates A–Z 1–10 | Keep remake domain validation; document locale limits |
| Rebus cancel/save | buttons, Enter, Escape, outside click | browser prompt OK/Cancel | Restore semantic sheet/popover and focus return |
| Non-rebus context menu | reveals if empty | native context menu | Retire hidden reveal gesture only after explicit replacement exists |
| Circled/shaded cells | parsed and styled | domain fields and classes | Match with combined-state fixtures |

### 9.6 Completion and history

| Capability | Legacy | Current remake | Target disposition |
|---|---|---|---|
| Detect fully correct puzzle | during Check | after every entry mutation | Keep remake auto-detection if full-grid exactness is the only oracle leak |
| Detect merely full puzzle | not treated as solved by checker | no completion unless exact, but individual clues already vanish | Keep puzzle distinction; fix clue lifecycle |
| Auto completion | stops timer, celebrates, records solve after all-correct Check | opens modal and records at exact final letter | Owner approval recommended; safe if non-blocking |
| Reveal-all completion | records solved | domain becomes complete and records | Match with correct assistance/score receipt |
| Complete button on incomplete grid | asks confirmation, records as completed, loads new puzzle | records as solved immediately with no confirmation; stays on puzzle | P0 trust issue: rename to Skip/Archive or require valid completion |
| Duplicate completion | backend/local checks; date identity | ref guard plus replace-by-id list | Keep stable puzzle IDs; fix forced duplicate semantics |
| History fields | day, title, authors, completion date, time, score | id, title, active time, completion date | Merge useful fields plus provenance/assist receipt |
| History grouping | weekday sections | flat most-recent list | Group/filter by day without mandatory dashboard |
| Completion storage | localStorage + SQLite | localStorage list plus IndexedDB session | Replace with one IndexedDB source and export schema |
| Completion celebration | score-tier fireworks/audio up to 8s | modal only | Add optional off/subtle/full bounded effects later |

### 9.7 Timing and persistence

| Capability | Legacy | Current remake | Target disposition |
|---|---|---|---|
| Timer meaning | wall time since puzzle init | active-time accumulator with inactivity cap | Keep remake |
| Explicit pause | absent | present and blocks input | Keep remake |
| Page-hidden behavior | timer interval can continue | persistence flush exists; active-time function caps idle | Keep/remediate with visibility tests |
| In-progress letters | cached puzzle bodies but no durable current solve snapshot | session snapshot in IndexedDB | Keep remake |
| Selection persistence | no | yes in session | Keep remake |
| Check feedback persistence | no | checked IDs yes, current incorrect IDs no | Define coherent evaluation receipt persistence |
| Preferences | weekday localStorage; theme depends on current inline scheme | theme localStorage; weekday state not obviously persisted | Persist explicit player preferences locally |
| Export/import | removed historical work; absent current legacy | versioned continuity archive | Keep remake and expand to profile/history/queue |
| Data integrity | ad hoc JSON and server DB | schema validation + archive integrity | Keep remake |

### 9.8 Puzzle acquisition and offline continuity

| Capability | Legacy | Current remake | Target disposition |
|---|---|---|---|
| Startup puzzle | random provider puzzle for saved weekday | bundled local original fixture, restored session | Keep legal local startup |
| Weekday chooser | Monday–Friday | Monday–Sunday for bridge loading | Keep seven-day taxonomy; gate unsupported generation honestly |
| Random historical provider load | backend `/random_crossword` | temporary frontend client still calls bridge routes | Retire from public build; retain local continuity only |
| Provider solution link | XWord Info | removed | Retire |
| Offline puzzle cache | up to 50 per weekday in localStorage | constructed puzzle repository/queue emerging in IndexedDB | Replace with licensed original queue |
| Cache status/progress | explicit modal and manual fill | absent for puzzle queue; model setup only | Replace with original-queue/storage status |
| Avoid already solved puzzle | local + backend lookup | queue/history behavior incomplete | Implement locally by stable puzzle ID |
| Failed online load | fallback to cached crossword | notice; current playable puzzle retained by `replacePuzzle` only on success | Keep current-puzzle retention; add local queue fallback |
| Original construction | absent | required WebLLM + constructor worker path | Remake-only core capability; retain and harden |
| Construction progress/cancel | absent | blocking button/generic notice; no retained cancel signal | Add staged truthful job surface |

### 9.9 Themes, responsive behavior, and accessibility

| Capability | Legacy | Current remake | Target disposition |
|---|---|---|---|
| Day/night | system-derived initial inline `color-scheme`, user toggle | persisted explicit toggle | Keep remake; honor system on first use |
| Wide panorama | present | present | Preserve |
| 1136px behavior | squeezed three-column legacy | grid-first stack from appended media query | Remake improvement, but replace with a more intentional focus-wing mode |
| 390px grid fit | separate legacy mobile role page; desktop page clips | fluid cell size avoids horizontal overflow | Keep fit; design intentional mobile hierarchy |
| Mobile zoom | legacy role page disables zoom | remake index permits normal viewport zoom | Keep remake |
| Grid accessible names | generic zero-based cell labels | number, one-based coordinate, value, selected state | Keep remake and add direction/clue context |
| Clue keyboard access | absent | operable but excessively tabbable | Improve to composite/roving focus |
| Dialog semantics | weak | role/name/Escape/autofocus added | Keep, add containment and focus restoration |
| Reduced motion | absent | test emulates preference, CSS lacks comprehensive policy | Implement real style behavior |
| Forced colors | absent | semantic smoke only | Add state/geometry assertions |
| Visible focus | inconsistent | current input/row focus varies by copied CSS | Define one focus system |
| Control label legibility | complex legacy cascade | same cascade plus more controls in less space | Owner override and flatten cascade |
| Idle energy | no continuous clue animation, but blur/shadows and completion RAF | same copied effects; no normal RAF | Subtract blur/large shadows; keep bounded effects |

### 9.10 Multiplayer and shared play

| Capability | Legacy | Current remake | Target disposition |
|---|---|---|---|
| Create room | backend 4-letter room | absent | Defer pending explicit architecture |
| Across/Down role split | QR links to separate role clients | absent | Preserve product idea, not implementation |
| Shared cell updates | Socket.IO in-memory room | absent | Defer; frontend-only requires a real signaling/sync decision |
| Role swap | request/confirm protocol | absent | Preserve as research input |
| Mobile Clear Errors | implemented on role client | absent | Recover behavior in main solver independent of multiplayer |
| Open macOS hotspot settings | server endpoint | absent | Retire from public product |

The legacy multiplayer implementation is not deployable architecture: permissive CORS, in-memory rooms, short room IDs, server state, and a host system-settings launcher. It is nevertheless valuable product archaeology, especially its cooperative role split and superior check/correction interaction.

---

## 10. What the remake genuinely improves

Parity work must not accidentally revert these gains:

1. One `Selection` object joins cell, direction, and entry instead of separate mutable fields.
2. Stable puzzle/cell/entry IDs replace clue-text identity and date-only identity.
3. Clicking a clue targets its first unresolved cell.
4. Grid interactions can derive and highlight an active clue.
5. Input, paste, dictation-like change events, and rebus domain validation are better separated.
6. Active time, explicit pause/resume, and event receipts are a better basis than a wall-clock interval.
7. In-progress sessions persist in IndexedDB and pass compatibility validation.
8. Continuity export/import is versioned and integrity checked.
9. Dialog naming and Escape behavior have improved.
10. Provider solution links have been removed from the deployable surface.
11. Local model setup and original construction have real application/worker boundaries.
12. The test harness, visual fixtures, property tests, and build gates are much stronger foundations than the legacy suite.

The issue is not that the remake is worthless. The issue is that architectural improvements were allowed to redefine high-frequency solve semantics without differential tests.

---

## 11. Legacy defects not to fossilize

1. `completedWords` is keyed by clue text, so duplicate clue text collides.
2. Active direction, active clue number, and input direction can drift independently.
3. Grid focus alone does not reliably project an active clue.
4. In-progress solve state is not durably persisted.
5. Desktop Check and mobile Clear Errors implement two inconsistent state machines.
6. Per-cell reveal is hidden behind right-click and lacks confirmation/affordance.
7. Rebus entry is effectively mouse/Space special-case behavior.
8. The timer measures unattended wall time.
9. Solved history is split between localStorage and SQLite, while the modal relies on the backend.
10. The clue lanes and seam sides derive from changing DOM parity.
11. The mobile role page disables user zoom and is separate from the real solver.
12. Accessibility, focus management, reduced motion, and forced colors are largely unspecified.
13. The provider/cache/multiplayer backend cannot ship as the privacy-first public architecture.

“Use legacy as oracle” means preserve its successful player contract, not its incidental data structures or deployment liabilities.

---

## 12. Test-suite diagnosis

### Tests that currently protect the wrong outcome

- `apps/web/e2e/workflow.spec.ts` says editing clears the stale error and asserts the red state disappears after typing. The owner requires check context to persist for all other errors.
- `apps/web/src/App.test.tsx` similarly expects the edited cell not to be red but does not assert the fate of other error cells, allowing global clearing.
- `apps/web/e2e/highlights.spec.ts` locks the active watermark to exactly `240px` and `0.45` opacity. The owner now rejects that rendered result.

### Tests that are too weak to catch the reported failure

- The Down paint test clicks the first Down clue from the initial first cell; the focus callback's same-cell early return masks the direction race.
- The clue-cell focus test covers Across only and does not begin in the opposite direction.
- Check tests cover one wrong letter but not empty neutrality, toggle-off, repeated score, error-set persistence, or Clear incorrect.
- Completion tests fill the authoritative solution but do not distinguish filled, verified, clue-collapsed, skipped, and solved.
- Visual snapshots show half-complete layout but do not assert stable lane assignment or clue recoverability.
- Axe-only checks do not establish keyboard travel, focus restoration, announcement quality, control-label legibility, or non-color state equivalence.
- Responsive tests assert basic fit/order but not whether the active clue and answer pattern remain visible and usable.

### Missing differential harness

Create a provider-neutral scenario DSL that can drive both implementations with the same small puzzle and compare observations:

```ts
type SolverAction =
  | { type: 'click-clue'; entry: '1A' | '1D' }
  | { type: 'click-pattern'; entry: '1A' | '1D'; position: number }
  | { type: 'click-grid'; cell: string }
  | { type: 'key'; key: string }
  | { type: 'check' }
  | { type: 'clear-incorrect' }
  | { type: 'reveal'; scope: 'cell' | 'entry' | 'puzzle' };
```

Each step records direction, selected cell/entry, entered values, visible clue IDs, per-cell evaluation state, score, counters, focus target, scroll positions, and completion status. During migration, expected observations may be:

- `legacy`: must match;
- `owner`: explicit approved divergence;
- `remake`: retained improvement.

This prevents another “exact replica” declaration based on CSS comments and a handful of screenshots.

---

## 13. Updated release blockers

The solver should not receive visual-polish sign-off until all of these are closed:

- [ ] Explicit clue/pattern direction survives focus synchronization.
- [ ] Empty cells remain neutral under every Check scope.
- [ ] Check toggles off without another evaluation or score change.
- [ ] Per-cell correction preserves all other known errors.
- [ ] Clear incorrect is available and tested.
- [ ] Score matches the legacy formula or a separately owner-approved replacement.
- [ ] Filled unchecked and checked-wrong clues never disappear.
- [ ] Verified clue compaction is reversible and lane-stable.
- [ ] Watermark tests prove readability/containment rather than exact oversized pixels.
- [ ] The remake-only inset spine edge is removed or given stable semantic geometry.
- [ ] Visible control labels pass owner legibility review in all themes/states.
- [ ] Incomplete Complete/Skip behavior cannot be recorded as a legitimate solve silently.
- [ ] Browser tests cover the actual sequences in Section 8.

---

## 14. Audit conclusion

The remake has better foundations but currently a worse correction loop. The biggest mistake was treating copied appearance as fidelity while the behavioral state machines diverged underneath it. The path forward is not to discard the remake. It is to make the legacy solver, the useful mobile Clear Errors flow, and the owner's current decisions into executable contracts around the cleaner domain architecture.

The most important design principle is now concrete:

> A player's explicit action remains authoritative until another explicit action changes it. Typing cannot silently change direction; filling cannot silently claim completion; checking cannot silently consume score; correcting one cell cannot silently erase knowledge about all other errors.

## Status update — 2026-09-03, implementing agent (correction pass)

Immediate correction order executed; branch v2, pushed. Verification: domain
22 unit, web 18 unit, 32 e2e (twice, stable), production build via esbuild
(tsc currently blocked only by the generation agent's in-flight
constructionClient refactor).

1. **Selection authority (P0)** — fixed: direction decisions read fresh state
   inside the updater; focus events can no longer overwrite an explicit clue
   direction. Regression e2e added: Down clue click + two letters land
   vertically (real-cell-0-0/1-0).
2. **Three-way check state (P0)** — fixed in domain: `checkedCellIds` only
   accepts non-empty cells; stale marks on emptied cells drop on re-check;
   empty cells render neutral. Unit tests added.
3. **Check toggle (P0)** — fixed: two-state control with pressed state;
   toggle-off hides feedback without re-evaluating, counting, or scoring.
4. **Score contract (P0)** — fixed: explicit assistance accounting
   (wrong-check entries x10 + reveals x10); repeated/no-error checks are
   score-idempotent; count = check-mode entries, not events.
5. **Check context through edits (P0)** — fixed: edits neutralize only the
   edited cell; other errors persist; new Clear-incorrect action empties all
   known-wrong cells via domain `clearEnteredCells` (stays in check mode).
6. **Filled vs verified (P1)** — fixed: clues hide only on verified
   correctness; Completed stat + half-completed threshold use verified
   counts.
7. **Phase-2 seam edges (P1)** — removed (nth-child parity instability +
   mixed signals). Highlight/affected keep legacy background tints only.
8. **Watermark (P1, owner override)** — font-size now responsive to field
   height (`clamp(5.5rem, 11.5dvh, 10rem)`), fully contained in the column;
   the exact `240px` golden is replaced by range + containment assertions;
   tuned colors unchanged.
9. **Button labels (P1)** — first slice: the label-covering `::after`
   overlay is disabled and labels sit on the top paint layer; full
   contrast-matrix verification still open.
10. **Input model (P1)** — grid inputs accept paste/IME/autofill via
    onChange (fill-based e2e added); keyboard fast-path retained.

Open: repeated-click toggle on a selected crossing (needs product
decision), Clear-incorrect discoverability polish, button contrast matrix
across themes, CSS governance slices.
