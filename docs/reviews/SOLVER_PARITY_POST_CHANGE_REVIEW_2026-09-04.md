# Solver Parity Post-Change Review — 2026-09-04

**Status:** historical delta review; implementation checkpoint below supersedes
the open findings for the current `v2` worktree

**Observed at:** initial snapshot 2026-09-04 00:00 CEST; follow-up snapshot 00:03 CEST

**Purpose:** assess the solver changes that landed concurrently after the full legacy/remake audit, without rewriting the original evidence

**Related artifacts:**

- [`LEGACY_VS_REMAKE_FEATURE_AUDIT.md`](LEGACY_VS_REMAKE_FEATURE_AUDIT.md)
- [`../plans/09_SOLVER_INTERACTION_CONTRACT.md`](../plans/09_SOLVER_INTERACTION_CONTRACT.md)
- [`../plans/10_SOLVER_PARITY_REMEDIATION_HANDOFF.md`](../plans/10_SOLVER_PARITY_REMEDIATION_HANDOFF.md)

---

## 1. Executive verdict

The concurrent patch addresses several symptoms, but it is not safe to merge as the parity fix. It adds useful direction, Check-toggle, empty-neutral, localized-edit, and Clear incorrect behavior; however, it splits one semantic check state across persisted domain data and several ephemeral React states. That split already corrupts completion and clue visibility after reload.

The most serious browser result is unambiguous:

> The updated app rendered **Completed 78 / 78** and zero Across/Down clues while **179 of 187 playable cells were empty**.

The new Clear incorrect flow also rendered eight empty cells green in a direct browser probe. The current 18 web unit tests, 22 domain tests, and 11 selected Playwright journeys all passed despite these states.

This confirms the architecture problem described in the interaction contract: `checkedCellIds`, `incorrectCellIds`, `checkMode`, completion derivation, score, and persistence must be one coherent domain transition, not synchronized component variables.

---

## 2. What improved

These changes move in the right direction and should be preserved while the state model is corrected.

| Change | Current evidence | Disposition |
|---|---|---|
| Empty cells excluded from `checkedCellIds` during a new Check | `session.ts:394-406`; new domain test | keep the rule, express it as explicit evaluation state |
| Check button now has off/on branching | `App.tsx:300-319` | keep behavior, move transition/receipt into domain |
| No-error Check avoids the wrong-check penalty | `App.tsx:310-317` | keep parity rule, persist the receipt |
| Wrong Check uses −10 rather than −5 | `App.tsx:197-199` | keep check delta |
| One edited cell is removed from current mark sets | `App.tsx:253-289` | keep local invalidation intent |
| Clear incorrect action exists | `App.tsx:276-280` | keep action, fix atomic domain transition |
| Direction selection reads state inside the React updater | `App.tsx:201-216` | likely fixes the stale-closure clobber; retain after a stronger test |
| First-open-cell clue selection remains | `App.tsx:218-223` | mandatory remake improvement |
| Merely filled entries no longer disappear before Check | `ClueColumn.tsx:17-21,65-66` | keep, but do not immediately remove verified rows |
| Remake-only inset seam edges were removed in a follow-up CSS edit | `legacy.css:2079-2081` | keep removal; repair the malformed adjacent comment |

The changes demonstrate that the reported failures were real and actionable. They do not yet satisfy the full interaction contract.

---

## 3. P0 findings in the new patch

### P0-1 — reload can claim an empty puzzle is fully completed and remove every clue

Current state is divided as follows:

- `session.checkedCellIds` is persisted;
- `incorrectCellIds` is local React state and initializes empty;
- `checkMode` is local React state and initializes off;
- `verifiedEntries` is derived from checked IDs minus the local incorrect set;
- `isEntryVerified` does not require the cells to remain non-empty;
- clue filtering ignores whether check presentation is on.

After reload, checked IDs survive but the matching incorrect IDs do not. Every checked wrong cell is therefore reinterpreted as correct for entry verification. A prior broad checked-ID set can make every entry “verified” even when most values are empty.

**Running-browser evidence:**

```text
completed: 78 / 78
across clues rendered: 0
down clues rendered: 0
playable inputs: 187
empty inputs: 179
check aria-pressed: false
```

**Required fix:** store a coherent evaluation receipt with per-cell state/value, or discard the entire evaluation on hydration. Verified status must require current non-empty correct/revealed evaluations. Clue visibility must not depend on a partially restored check state.

**Missing test:** Check a mixed wrong/empty puzzle, persist, reload, and assert completion, visible clues, evaluation states, score, and counters all agree.

### P0-2 — Clear incorrect marks the newly emptied cells green

`clearEnteredCells` clears entered values but leaves `checkedCellIds` intact. The UI then clears the entire local `incorrectCellIds` array. While check mode remains on, those old checked IDs are now “checked and not incorrect,” so grid and mini-cells render green even though their values are empty.

**Running-browser evidence after checking eight wrong cells and pressing Clear incorrect:**

```text
non-empty cells: 0
red cells: 0
green cells: 8
green empty cells: 8
check mode: on
checks: 1
score: 90
```

**Required fix:** Clear incorrect must atomically clear each wrong value and invalidate exactly those cells' evaluations. No intermediate or final state may contain an empty correct/green cell.

**Why the new test missed it:** `check.test.ts` asserts only that requested values are empty. It does not assert checked/evaluation cleanup, entry verification, presentation, score, or mode.

### P0-3 — the workaround for focus races breaks multi-character paste

`currentTargetCellId()` reads the currently focused DOM input, and `retargetSelection()` moves semantic selection back to that DOM cell before every character. The paste handler calls `onEnter` repeatedly while browser focus remains on the original input. Each queued character is therefore retargeted to the original cell and overwrites the previous character.

**Running-browser evidence:** pasting `CARE` into `real-cell-0-0` produced:

```text
['E', '', '', '']
```

Expected result is `['C', 'A', 'R', 'E']` along the active entry.

**Required fix:** selection is authoritative and focus follows selection. Do not repair semantic selection from the DOM for every character. Paste must be one domain transaction or a sequence over the newly returned selection state.

**Missing test:** paste four characters and assert all four target cells plus the final selection/direction.

### P0-4 — score and Check state reset on reload

The new `assist` object, `incorrectCellIds`, and `checkMode` are component state rather than part of the versioned session. Reload resets visible Checks, Reveals, and Score even though the persisted session still contains check/reveal events and checked IDs.

This is both a player-visible accounting bug and the cause of P0-1.

**Required fix:** immutable assistance/evaluation receipts belong to the domain snapshot/event log. Derive counters and score from persisted receipts; never maintain a parallel UI ledger.

### P0-5 — Reveal scoring still violates legacy parity

The current formula is:

```ts
100 - wrongChecks * 10 - reveals * 10
```

`handleRevealAll` increments `reveals` by one. Therefore Reveal all costs 10, not the legacy 50; an eventual cell reveal would also have no way to express the legacy 20 penalty. The reveal counter also counts events rather than newly revealed cells.

**Required fix:** typed assistance receipts with distinct cell-reveal and puzzle-reveal projections, as specified in the interaction contract.

---

## 4. P1 findings in the new patch

### P1-1 — verified clues still disappear immediately

The filter changed from “all values are truthy” to `isEntryVerified`, which fixes premature disappearance while typing. It still removes a verified clue immediately after Check, including while the player is viewing the check result.

The owner asked that clues not disappear immediately. The first parity release should keep every clue rendered and apply a verified style. Compaction can be designed later and must be reversible/lane-stable.

### P1-2 — the Check label describes current state, not the next action

When pressed, the visible text is `Checking ✓`. Pressing it actually hides feedback. Use **Hide check** while active so the control is self-explanatory. The check mark may be supplemental, not the action name.

### P1-3 — there are four competing check-state authorities

The component now contains:

- persisted `session.checkedCellIds`;
- local `incorrectCellIds`;
- local `checkMode`;
- old local `checking`, which is written but no longer read.

This creates legal but incoherent combinations and makes persistence impossible to reason about. Remove the dead state and replace the remaining split with one domain-owned check presentation/evaluation object.

### P1-4 — the new direction regression still tests the masked special case

`play.spec.ts` clicks the first Down clue from the initial first Across cell. Both use `real-cell-0-0`, so the same-cell early return can still mask the historical race. The comment says it covers the clobber case, but it does not start in the opposite direction and choose a different crossing as required by the audit.

Add both symmetric cases:

1. begin Across → click Down whose first open target is a different crossing;
2. begin Down → click Across whose first open target is a different crossing.

Then type two letters and assert placement, selected entry, direction attribute, and focused cell.

### P1-5 — completion and clue correctness are still inferred in React

Both `App.tsx` and `ClueColumn.tsx` independently implement “verified entry” logic. This duplicates a high-risk rule and already omits the non-empty requirement. The domain must expose entry solve state; presentation components should only render it.

### P1-6 — the visual harness contract is broken

Making `checking` a required prop on `ClueColumn` and `LegacyGrid` did not update all harness call sites. `npm run web:build` fails with three missing-prop errors in `HarnessPage.tsx`.

Two additional build errors about `resolveSpokenAnswer` belong to concurrent voice/model-runtime work, not this parity patch. They still mean the shared branch is not releasable.

### P1-7 — existing tests emit React key warnings

Web unit tests pass but emit “Each child in a list should have a unique key” from `ClueColumn`. The `<li>` mapped from visible entries lacks `key={entry.id}`. This is not the core behavior bug, but unstable reconciliation is especially dangerous in a stateful, changing clue list.

### P1-8 — visual issues are untouched

The inset edge was removed during this review, but `nth-child` lane geometry, oversized direction words, and the control-label cascade remain. Do not start the full visual package until stable entry state/lane attributes exist, and do not count the edge removal alone as resolving the requested UI review.

### P1-9 — the follow-up CSS edit leaves an unterminated comment

The comment beginning `/* watermark:` near `legacy.css:2084` has no closing `*/` before the compact-desktop and mobile media-query sections. Those responsive rules are therefore swallowed by the comment in the current stylesheet.

**Required fix:** close or remove the stale watermark comment and add a build/stylesheet assertion proving the 1136 px and ≤768 px rules are parsed and active. Do not restore the rejected exact-pixel watermark claim contained in that comment.

---

## 5. Test result interpretation

Commands run against the post-change worktree:

| Command | Result | Meaning |
|---|---|---|
| `npm run web:test -- --run` | 18/18 pass; React key warnings | component coverage does not exercise multi-error, reload, or Clear incorrect presentation |
| domain Vitest suite | 22/22 pass | new empty-neutral value test passes; evaluation lifecycle remains under-specified |
| Playwright `play.spec.ts` + `workflow.spec.ts` | 11/11 pass | current journeys miss the verified-empty reload, batch-clear, paste, and symmetric direction cases |
| `npm run web:build` | fail | solver harness props plus concurrent voice/runtime interfaces are incomplete |

Passing tests currently coexist with:

- 179 empty cells reported as 78/78 completed;
- all 78 clues absent;
- eight empty cells painted green;
- four pasted characters collapsed into one cell;
- score/counters lost on reload.

This is the exact reason Wave 0 of the remediation handoff requires semantic end-to-end observations rather than local assertions.

---

## 6. Required correction order for the current patch

1. Stop deriving verified state independently in React.
2. Introduce one domain-owned evaluation/check model with coherent serialization.
3. Make Clear incorrect an atomic transition that clears matching evaluations.
4. Remove DOM-focus retargeting from per-character entry and restore multi-letter paste.
5. Derive score/counters from persisted typed receipts; implement distinct reveal penalties.
6. Keep verified clues rendered in the first parity slice.
7. Strengthen direction coverage to different-crossing symmetric cases.
8. Update the visual harness and eliminate the duplicate/dead `checking` state.
9. Only then perform the spine/watermark/control CSS package.
10. Re-run build, semantic Playwright journeys, reload tests, and targeted mutation tests.

Do not add more conditional synchronization among the current React states. That would make the transient combinations harder to reproduce while preserving the underlying split-brain model.

---

## 7. Merge gate for this patch family

The solver parity patch family is not merge-ready until all statements are true:

- [ ] a mixed checked session reloads without changing correctness, completion, clue visibility, score, or counters;
- [ ] Clear incorrect leaves every cleared cell empty and unevaluated, with zero green empties;
- [ ] pasting a word fills consecutive cells and preserves selected direction;
- [ ] verified count cannot exceed the number of fully non-empty correct/revealed entries;
- [ ] all clues remain rendered through the first parity release;
- [ ] Check's active label says what pressing it will do;
- [ ] score differentiates wrong check, harmless check, cell reveal, puzzle reveal, and presentation toggle;
- [ ] both different-crossing direction journeys pass;
- [ ] `npm run web:build` passes after solver and concurrent interface updates land;
- [ ] mutation tests kill empty/correct, local/global-clear, filled/verified, and receipt-replay inversions.
- [ ] the stylesheet parses through EOF and the compact-desktop/mobile media queries are active.

## 8. Current closure checkpoint — 2026-09-05

The failure observations above remain useful regression history, but they no
longer describe the current implementation. The domain now owns a serialized
`checkPresentation` with per-cell value-aware evaluations, assistance receipts,
revisioned persistence, atomic `clearIncorrect`, and derived score/counters.
The React grid and clue spines consume `entrySolveState`; they do not maintain a
second incorrect/check ledger. The controlled-input path also handles paste and
multi-character input without retargeting from stale DOM focus.

Current evidence:

- `npm run test` — PASS (Python 76 passed / 3 deselected; all maintained JS/TS
  package suites pass).
- `npm run web:build` — PASS, including TypeScript and service-worker precache
  generation.
- `npm run e2e:ci` — PASS (39 Chromium journeys, including check/clear,
  reload accounting, paste, direction, responsive geometry, accessibility,
  voice fallback/cancellation, and no-provider routing).
- `packages/domain/src/check.test.ts` and
  `apps/web/e2e/workflow.spec.ts` cover empty-neutral evaluation, zero green
  empty cells after clearing, persisted receipts, score/counter replay, and
  stale-error invalidation.

The remaining unchecked boxes in the historical merge list are therefore
closed for the parity implementation slice. Real WebGPU/model hardware
coverage, a manual screen-reader pass, and the final visual/pain-trace budget
remain release evidence rather than hidden claims of completion.
