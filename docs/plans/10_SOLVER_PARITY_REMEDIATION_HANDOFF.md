# Solver Parity Remediation Handoff

**Status:** implementation-ready work plan

**Audience:** implementation, test, and UI agents

**Primary contract:** [`09_SOLVER_INTERACTION_CONTRACT.md`](09_SOLVER_INTERACTION_CONTRACT.md)

**Evidence audit:** [`../reviews/LEGACY_VS_REMAKE_FEATURE_AUDIT.md`](../reviews/LEGACY_VS_REMAKE_FEATURE_AUDIT.md)

**Current implementation delta:** [`../reviews/SOLVER_PARITY_POST_CHANGE_REVIEW_2026-09-04.md`](../reviews/SOLVER_PARITY_POST_CHANGE_REVIEW_2026-09-04.md)

---

## 1. Mission

Restore the original solver's trustworthy interaction loop on top of the remake's cleaner architecture, while retaining explicit owner-approved improvements.

This plan is intentionally narrower than the product roadmap. It does not modify generation, local-model inference, lexicons, construction algorithms, content pipelines, or deployment. Those areas may continue independently only when they do not touch the solver files assigned here.

The implementation is complete when explicit direction survives focus, Check tells the truth, correction preserves useful error context, clues remain available until verified, score is auditable, and the spine is visually legible and stable.

---

## 2. Read before editing

Every participating agent must read, in order:

1. `AGENTS.md`;
2. `docs/reviews/LEGACY_VS_REMAKE_FEATURE_AUDIT.md`;
3. `docs/plans/09_SOLVER_INTERACTION_CONTRACT.md`;
4. the relevant current implementation and its tests;
5. the corresponding legacy implementation only for the behavior under change.

Do not treat current tests, comments containing “legacy,” or ADR 0003's exact-pixel conclusion as higher authority than the new interaction contract.

If code and contract conflict, change the code and its stale test. If the contract itself is ambiguous, record the question in this document's Decision log before choosing behavior.

---

## 3. Confirmed baseline failures

These are already source-traced and browser reproduced; agents should turn them into tests, not spend a work session rediscovering them.

| ID | Failure | Proven cause | Priority |
|---|---|---|---:|
| SEL-1 | prior direction can overwrite an explicit clue direction | programmatic input focus invokes a stale `onFocus` selection callback | P0 |
| CHK-1 | empty cells turn green after Check | all scoped cells enter `checkedCellIds`; “not incorrect” renders correct | P0 |
| CHK-2 | second Check reevaluates and penalizes instead of hiding feedback | button always invokes `checkSession`; no toggle transition | P0 |
| CHK-3 | one edit erases every error marker | every enter/rebus/clear handler sets checking false | P0 |
| SCR-1 | harmless/repeated checks lose score | score counts every `checked` event at −5 | P0 |
| CLU-1 | fully wrong clue disappears immediately | visible entries filter on all cells being truthy | P0 |
| CMP-1 | incomplete Complete can be recorded as solved | UI records completion without exact validation or skip semantics | P0 |
| VIS-1 | colored spine edge changes meaning/side | appended edge rules use `nth-child` over a changing filtered list | P1 |
| VIS-2 | direction words overwhelm clue fields | exact `240px` watermark is golden-tested rather than semantically tested | P1 |
| VIS-3 | control labels are unreliable across states/themes | overlapping button cascades and a post-painted pseudo-element | P1 |

The targeted highlight, responsive, and workflow Playwright suites currently pass despite these failures. A green current suite is not acceptance evidence.

---

## 4. Delivery graph

```text
Wave 0: executable failing parity journeys
    ├── Wave 1A: domain evaluation + receipts
    └── Wave 1B: selection/focus transaction
             ↓
Wave 2: UI integration + clue lifecycle + correction commands
             ↓
Wave 3A: persistence/completion/reveal
Wave 3B: spine and control visual repair
             ↓
Wave 4: mutation, accessibility, responsive, and full regression gates
```

Wave 1A and 1B may proceed in parallel because they have disjoint production ownership. Wave 2 has a single UI integration owner because most flows meet in `App.tsx`; splitting that file among simultaneous agents invites another collection of locally correct, globally inconsistent handlers. Wave 3A and 3B may proceed in parallel after Wave 2 publishes stable state/classes/data attributes.

---

## 5. Work package 0 — lock the failures

### Ownership

Test-only agent owns new parity harness and parity test files. It does not edit product code or weaken unrelated assertions.

Suggested files:

- new `apps/web/e2e/solver-parity.spec.ts`;
- new or extended `apps/web/src/solver-parity.test.tsx` if component integration is necessary;
- new `tests/characterization/solver-scenarios.mjs` plus small legacy/remake adapters if a shared driver is practical;
- legal deterministic mini fixture already approved by repository policy.

Do not make sweeping changes to `workflow.spec.ts` or `highlights.spec.ts` in this package. Mark conflicting assertions with a precise reference to the new contract; replace them after the new failing scenario exists.

### Required red tests

- SEL-1 in both directions, starting in the opposite direction and clicking a **different crossing**;
- CHK-1 empty cells stay neutral;
- CHK-2 second press exits without counter or score change;
- CHK-3 editing one of at least three errors leaves the other two visible;
- SCR-1 a correct/empty check costs zero;
- CLU-1 a full wrong entry remains visible, in the same lane;
- CMP-1 incomplete Complete does not create a solved record;
- the first-open-cell behavior remains green throughout remediation.

### Observation schema

Each scenario step should be able to capture:

```ts
interface SolverObservation {
  selectedCellId: string;
  selectedEntryId: string;
  direction: 'across' | 'down';
  focusedCellId: string | null;
  values: Record<string, string>;
  evaluations: Record<string, 'none' | 'empty' | 'correct' | 'incorrect' | 'revealed'>;
  visibleEntryIds: string[];
  laneByEntryId: Record<string, string>;
  score: number;
  checks: number;
  reveals: number;
  checkMode: 'off' | 'on';
  completion: 'in-progress' | 'verified' | 'revealed' | 'skipped';
}
```

Prefer semantic test hooks (`data-cell-id`, `data-entry-id`, state attributes, accessible roles/names) over CSS structure. Do not introduce production branches for tests.

### Acceptance

- every listed regression has a test that fails for the intended reason on the baseline;
- each failure message exposes the semantic mismatch, not a brittle pixel selector;
- the first-open-cell retention test passes before and after the changes;
- tests can run independently and do not require provider content or network access.

---

## 6. Work package 1A — domain evaluation and score ledger

### Ownership

Domain agent owns only `packages/domain/` and its tests during this package.

Primary files:

- `packages/domain/src/session.ts`;
- `packages/domain/src/index.ts`;
- existing/new tests beside session/check logic.

It does not edit React components, CSS, Playwright files, persistence repositories, or generation packages.

### Deliverables

1. Replace ambiguous checked/incorrect set behavior with an explicit evaluation model conforming to the contract.
2. Implement pure transitions for:
   - enter check mode and evaluate scope;
   - hide check feedback without evaluating;
   - invalidate only an edited cell's evaluation;
   - clear all currently incorrect values without leaving mode;
   - derive verified entry IDs;
   - emit stable assistance receipts;
   - project score and counters from receipts.
3. Preserve typed event compatibility through an explicit migration or schema version bump. Do not silently reinterpret old `checked` events.
4. Ensure hydrate/replay is idempotent.

### Domain invariants

- an empty cell never derives `correct`;
- correct, incorrect, empty, revealed, and unevaluated are mutually exclusive;
- editing cell X cannot change the evaluation of cell Y;
- hide feedback creates no event or receipt;
- Clear incorrect changes exactly the values/evaluations in the current incorrect set;
- verified entry implies every entry cell is non-empty and correct/revealed;
- score equals the legacy-parity receipt formula and is replay-stable;
- no transition compares against the solution unless it is Check, Reveal, or final exact-completion detection.

### Tests

Use table tests plus property tests for local invalidation and receipt replay. At minimum, generate sessions with mixed empty/correct/wrong/rebus values and prove the partition is total and disjoint.

Mutation targets must kill:

- adding empty cells to correct results;
- replacing “some wrong” with “any checked” for penalty;
- changing −10, −20, or −50 constants;
- clearing the full evaluation map on one edit;
- emitting a second receipt during replay;
- using filled-entry status as verified status.

### Acceptance

- domain tests pass without a DOM;
- public transitions make illegal check states unrepresentable or explicitly rejected;
- score can be reconstructed from serialized receipts with identical output;
- no React knowledge enters the domain package.

---

## 7. Work package 1B — authoritative selection and focus

### Ownership

Selection agent owns:

- the selection application service/domain helpers used by the web app;
- `apps/web/src/components/legacy/LegacyGrid.tsx` only where focus/input signaling is defined;
- focused selection tests.

It does not edit `App.tsx`, clue filtering, Check behavior, CSS, persistence, or generation. If an `App.tsx` adapter change is unavoidable, publish the needed interface and leave integration to Wave 2.

### Deliverables

1. Give every semantic selection action a source: grid cell, repeated grid cell, clue, mini-cell, keyboard traversal, or hydration repair.
2. Make programmatic focus a one-way effect of committed selection.
3. Ensure an `onFocus` caused by that effect cannot generate a stale second selection.
4. Implement or expose pure transitions for selected-crossing toggle, Space, Tab, and Shift+Tab.
5. Retain first-open-cell clue selection and exact mini-cell selection.

An acceptable approach is a reducer/effect transaction with a focus-origin token. Another is removing semantic mutation from input `onFocus` and handling only genuine browser/user focus entry. The contract matters more than mechanism.

### Acceptance

- the symmetric direction tests pass under real focus timing;
- no arbitrary timeout is used to “wait out” focus;
- pointer, keyboard, paste, and restored selection share one invariant;
- selected cell, entry, and direction can never disagree after a public transition.

---

## 8. Work package 2 — single-owner UI integration

### Ownership

One integration agent owns during this wave:

- `apps/web/src/App.tsx`;
- `apps/web/src/components/legacy/ClueColumn.tsx`;
- wiring changes required in `LegacyGrid.tsx` after merging Wave 1B;
- directly corresponding React tests.

It does not restyle the app beyond minimal state hooks, modify persistence repositories, or touch generator packages.

### Deliverables

1. Wire Check ↔ Hide check to domain transitions and add visible pressed state.
2. Add Clear incorrect only while it is meaningful.
3. Stop clearing global check feedback from enter, rebus, and clear handlers.
4. Render explicit evaluation states; empty is neutral.
5. Derive clue state from domain lifecycle, not `Boolean(value)` fill filtering.
6. Keep all clues rendered for the first parity release; verified clues may receive a stable reduced-emphasis class.
7. Base solved/half-complete metrics only on verified entries.
8. Expose stable `data-entry-id`, lane, direction, solve-state, evaluation-state, and selection attributes needed by visual/test layers.
9. Preserve selected clue visibility and first-open behavior.

### Replacement of stale tests

- Replace “typing clears stale error” with “typing invalidates only the edited cell and preserves unrelated errors.”
- Replace “filled clue disappears” assumptions with lifecycle assertions.
- Keep the useful assertion that the edited cell is not still red for its old value.

### Acceptance

- all Wave 0 semantic journeys except persistence/visual-specific ones pass;
- the UI contains no independently derived `checking` boolean that can disagree with domain state;
- `ClueColumn` does not filter on filled values;
- component state never infers correctness from absence of an incorrect ID.

---

## 9. Work package 3A — persistence, completion, reveal, and history

### Ownership

Persistence/completion agent owns the IndexedDB/session repository, archive/history schema, completion flow, and tests. Coordinate any `App.tsx` call-site changes through the Wave 2 owner or make them after that wave lands.

It does not edit solver CSS or generation.

### Deliverables

1. Persist the coherent semantic state listed in the contract, including evaluation receipt identity and assistance ledger.
2. Migrate or safely discard partial old check state; never restore green without the matching incorrect state.
3. Make assistance replay idempotent.
4. Separate verified, revealed, skipped, and in-progress outcomes.
5. Prevent incomplete Complete from silently creating a solve. Prefer validation or rename to Skip/Archive with confirmation.
6. Restore legacy-parity cell/puzzle reveal accounting and explicit accessible cell reveal.
7. Store score snapshot, counters, active time, puzzle metadata, and completion type in history.

### Acceptance

- reload during Check mode either restores the full coherent evaluation or deliberately returns to mode off;
- score/counters are identical before and after reload;
- clicking completion controls twice produces one history outcome;
- incomplete, revealed, and verified puzzles cannot be confused in history;
- tests cover schema migration from at least the immediately previous persisted version.

---

## 10. Work package 3B — spine and control visual repair

### Ownership

Visual agent owns:

- `apps/web/src/legacy.css`;
- visual/contrast/containment assertions and screenshots;
- no semantic React behavior.

If markup or data attributes are missing, request them from the Wave 2 owner instead of deriving meaning from child position.

### Deliverables

1. Remove the phase-2 orange/blue inset edge rules or replace them only with contract-backed stable lane geometry.
2. Eliminate semantic `nth-child` dependence for clue lane/seam state.
3. Redesign the Across/Down field words using container-bounded scale and containment.
4. Replace the exact `240px` golden assertion with:
   - field containment;
   - non-overlap with grid and control strip;
   - clue/pattern contrast;
   - whole-word recognition at target panorama;
   - narrow-layout fallback.
5. Consolidate button rules into one explicit paint stack; labels must sit above decorative pseudo-elements.
6. Provide robust selected, crossing, correct, incorrect, revealed, verified, focus, hover, disabled, and forced-color states.
7. Keep normal play free of continuous animation and expensive large-area blur/glow.

### Visual matrix

Capture at minimum:

| Viewport/state | Day | Night | Reduced motion | Forced colors |
|---|---:|---:|---:|---:|
| 1440 × 900 initial | yes | yes | yes | yes |
| 1440 × 900 checked errors | yes | yes | no | yes |
| 1136 px grid-first transition | yes | yes | no | no |
| 390 × 844 active clue | yes | yes | yes | no |
| 200% zoom desktop | yes | yes | no | no |

### Acceptance

- the owner can read every primary label and both clue fields without explanation;
- watermark bounds are inside the correct field at every matrix viewport;
- no clue changes seam side after other entries become verified;
- evaluation and selection remain distinguishable in monochrome/forced colors;
- browser performance recording shows no continuous style/paint activity while idle.

---

## 11. Work package 4 — quality gates and mutation proof

### Required test layers

| Layer | Responsibility |
|---|---|
| Domain unit | transition truth tables, invariants, scoring, local invalidation |
| Property | evaluation partition, selection validity, receipt replay, sequence idempotence |
| React component | visible labels/states and semantic attribute projection |
| Playwright journey | actual click/focus/typing order, correction loop, reload, responsive behavior |
| Differential characterization | legacy match or explicit owner-override tag |
| Visual | containment, stable geometry, state combinations, themes |
| Accessibility | keyboard journey, focus return, names/states, forced colors, zoom |
| Mutation | prove tests detect inverted predicates, cleared maps, wrong penalties, wrong filters |

### Existing false confidence to remove

1. A single first-Down click is not direction coverage.
2. An axe pass is not label-legibility or keyboard-travel coverage.
3. Exact computed font size is not watermark quality.
4. “Edited cell is no longer red” is not error-context preservation.
5. A completed solution fixture is not clue-lifecycle coverage.

### Mutation campaign

Prioritize changed domain and selection modules, not the whole repository. Surviving mutants in these rules block handoff:

- empty versus correct partition;
- previous versus explicit direction;
- same-cell early return versus crossing toggle;
- local versus global evaluation invalidation;
- check entry versus check exit event creation;
- erroneous versus harmless score penalty;
- filled versus verified clue status;
- single versus duplicate assistance receipt;
- flat reveal-all penalty versus per-event approximation.

Record mutation command, score, surviving mutants, and dispositions in `docs/mutation-testing.md`. Do not raise the global threshold by excluding hard files.

### Final gates

- `make doctor`;
- repository lint/typecheck/build/test gates;
- targeted parity Playwright project;
- targeted mutation configuration;
- content/provenance scan to prove no provider fixture entered new tests;
- `git diff --check`;
- manual owner review of the six release journeys.

---

## 12. Parallel-agent ownership rules

Agents share a repository and must not revert, reformat, or “clean up” unrelated work.

| Agent role | Exclusive production ownership | May start |
|---|---|---|
| Test harness | new parity/characterization test files only | immediately |
| Domain state | `packages/domain/**` | immediately after reading red scenarios |
| Selection/focus | selection helper/service + narrow `LegacyGrid` signaling | immediately after interface agreement |
| UI integrator | `App.tsx`, `ClueColumn.tsx`, final grid wiring | after domain/selection interfaces settle |
| Persistence/completion | repository/history/migration modules | after domain receipt schema settles |
| Visual | `legacy.css` + visual tests | after stable data attributes land |

No two simultaneous agents own `App.tsx`. No solver-parity agent touches construction or model-runtime packages. A necessary cross-owner change is requested in a short message containing the exact interface/attribute needed.

Keep commits reviewable and under the repository's staged-path limit. A recommended sequence is one red-test commit, one domain commit, one selection commit, one UI integration commit, one persistence/completion commit, one visual commit, and one final mutation/a11y reinforcement commit.

---

## 13. Copy/paste briefs for agents

### Test agent

> Own only new solver parity test/harness files. Read AGENTS.md, the legacy/remake audit, and the solver interaction contract. Encode the eight Wave 0 regressions as semantic failing tests against legal local fixtures. Do not change product code or weaken current tests. The direction case must start in the opposite direction and click a different crossing. Record exact commands and baseline failures.

### Domain agent

> Own packages/domain only. Implement the contract's explicit evaluation states, Check/Hide transitions, local edit invalidation, Clear incorrect transition, verified-entry derivation, assistance receipts, and legacy-parity score projection. Preserve clean dependency direction. Add unit/property/mutation-resistant tests. Do not edit React, CSS, persistence, generation, or current E2E files.

### Selection agent

> Own selection/focus behavior and its focused tests, with only narrowly agreed LegacyGrid signaling changes. Make explicit clue/mini-cell direction authoritative and make DOM focus a one-way projection. Retain first-open selection; add repeated-crossing toggle plus Space/Tab transitions. Do not edit App.tsx, clue lifecycle, Check behavior, CSS, persistence, or generation. Prove both direction transitions under real focus timing.

### UI integration agent

> Be the sole App.tsx/ClueColumn integration owner for this wave. Wire the landed domain and selection interfaces; add Check/Hide check, Clear incorrect, localized correction feedback, explicit cell evaluation projection, and the five-state clue lifecycle. Keep every clue rendered and stable. Replace stale global-clear/filled-hide expectations with contract tests. Make only minimal styling hooks; do not perform the visual redesign or touch generation.

### Persistence/completion agent

> Own semantic persistence, history, migration, completion, and reveal accounting after the receipt schema lands. Make hydration idempotent, prevent incomplete puzzles from being recorded as solved, distinguish verified/revealed/skipped outcomes, and prove reload stability. Coordinate App.tsx call sites with its owner. Do not edit CSS or generation.

### Visual agent

> Own legacy.css and visual acceptance tests after stable semantic attributes land. Remove the unstable inset spine edge and nth-child semantic geometry; make the Across/Down words contained and subordinate; make every control label readable in all states/themes; cover zoom, narrow layouts, reduced motion, and forced colors. Do not change solver behavior or infer state from DOM position.

---

## 14. Review checklist

Reject a change if any answer is “yes”:

- Can programmatic focus change semantic direction?
- Can an empty cell receive success styling or an accessible “correct” announcement?
- Can hiding check feedback affect score or counters?
- Can editing one cell remove another cell's error knowledge?
- Can a filled-but-wrong clue disappear or count as solved?
- Can DOM filtering change a clue's lane or colored edge?
- Can hydration count an old assistance event again?
- Can an incomplete puzzle enter solved history?
- Does a screenshot test lock an arbitrary legacy pixel without testing its purpose?
- Does a visual effect cover a visible label or repaint continuously while idle?
- Did solver parity work modify generation or provider content?

---

## 15. Decision log

| Date | Decision | Authority | Consequence |
|---|---|---|---|
| 2026-09-03 | Keep first-open-cell clue selection | owner | legacy first-cell behavior is deliberately superseded |
| 2026-09-03 | Check is a reversible presentation mode | legacy + owner | second press hides; it does not reevaluate |
| 2026-09-03 | Editing preserves other known errors | owner override | both legacy desktop global-clear behavior and remake behavior are superseded |
| 2026-09-03 | Add explicit Clear incorrect | owner + recovered mobile behavior | incorrect cells may be batch-cleared without a penalty |
| 2026-09-03 | Use legacy score formula for initial parity | audit recommendation pending any later redesign | harmless checks cost zero; erroneous evaluation −10; cell reveal −20; puzzle reveal −50 |
| 2026-09-03 | Keep clues rendered through verification in first parity slice | owner intent + stability requirement | no automatic row removal; compaction is deferred |
| 2026-09-03 | Remove unexplained remake-only seam edges | evidence audit | a future edge needs stable semantic meaning |
| 2026-09-03 | Replace exact 240 px watermark golden | owner override | test purpose: containment, recognition, and subordination |

Append new decisions; do not rewrite prior rows. A later owner decision can supersede a row explicitly.
