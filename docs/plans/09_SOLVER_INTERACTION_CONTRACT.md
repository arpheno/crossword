# Solver Interaction Contract

**Status:** proposed normative contract for parity remediation

**Authority:** owner decisions in this document override incidental legacy behavior and remake tests

**Scope:** solving, navigation, checking, scoring, clue presentation, completion, and solver accessibility

**Out of scope:** puzzle generation, personalization, model inference, and provider migration

---

## 1. Product promise

The player must always be able to answer four questions without guessing:

1. Which cell, entry, and direction will receive the next character?
2. Which cells have actually been evaluated?
3. Which clues are unfinished, filled, wrong, or verified?
4. Which deliberate assistance event changed the score?

The legacy solver is an executable reference, not an architectural template. The remake's stronger domain model, first-open-cell selection, persistence, dialogs, and input support remain. Owner-approved corrections in this contract supersede both implementations.

The governing invariant is:

> An explicit player action remains authoritative until another explicit player action changes it. Focus, layout, rendering, persistence, and derived projections may reflect semantic state; they may not reinterpret it.

---

## 2. Canonical state

### 2.1 Selection

Selection is one atomic value:

```ts
type Direction = 'across' | 'down';

interface Selection {
  cellId: CellId;
  entryId: EntryId;
  direction: Direction;
}
```

The selected entry must contain the selected cell and must have the selected direction. An invalid combination is rejected at the domain boundary rather than repaired later by an input focus event.

The DOM focus target is a projection of `Selection`, never a second source of truth. Programmatic focus caused by a semantic action must not dispatch another semantic selection. If focus events must be observed for accessibility, they may only reconcile focus when there is no pending explicit selection transaction.

### 2.2 Cell values

An ordinary cell contains either an empty string or a normalized uppercase value. Rebus values remain explicit multi-character cell values; they are not encoded as a separate invisible answer.

### 2.3 Evaluation

Evaluation is not represented by two overlapping sets whose absence implies correctness.

```ts
type EvaluationState =
  | 'unevaluated'
  | 'empty'
  | 'correct'
  | 'incorrect'
  | 'revealed';

interface CellEvaluation {
  state: EvaluationState;
  valueAtEvaluation: string;
}

interface CheckPresentation {
  mode: 'off' | 'on';
  scope: 'cell' | 'entry' | 'puzzle';
  scopeId?: CellId | EntryId;
  evaluations: ReadonlyMap<CellId, CellEvaluation>;
  receiptId?: string;
}
```

`empty` is deliberately distinct from `correct`. It renders neutral and is never announced as correct. `valueAtEvaluation` allows the domain to detect that a cell changed after an evaluation without erasing the results for unrelated cells.

### 2.4 Entry lifecycle

Every entry has a derived solve state:

```ts
type EntrySolveState =
  | 'empty'
  | 'in-progress'
  | 'filled-unverified'
  | 'checked-incorrect'
  | 'verified';
```

Visual compaction is a separate presentation preference. It is never encoded as a solve state and never inferred merely from every cell being non-empty.

### 2.5 Assistance ledger

Player-visible score and counters derive from immutable, typed receipts rather than button clicks:

```ts
type AssistanceReceipt =
  | { kind: 'check-evaluation'; hadIncorrectValue: boolean }
  | { kind: 'cell-reveal'; cellId: CellId }
  | { kind: 'puzzle-reveal' };
```

Showing, hiding, focusing, scrolling, or rendering feedback cannot create a receipt.

---

## 3. Selection and direction transitions

### 3.1 Pointer and clue actions

| Action | Required transition | Required focus |
|---|---|---|
| Click an Across clue | select that Across entry and its first open cell | selected grid cell |
| Click a Down clue | select that Down entry and its first open cell | selected grid cell |
| Click clue mini-cell | select that exact cell in the clue's direction | exact grid cell |
| Click an unselected grid cell | preserve current direction if that direction exists there; otherwise choose the cell's only valid direction | clicked cell |
| Click the already selected crossing cell | toggle Across ↔ Down | same cell |
| Click a selected cell with one entry | keep its only direction | same cell |

“First open” means the earliest empty cell in clue order; if the entry is full, it means the first cell. This remake improvement is mandatory.

An explicit clue or mini-cell click is direction-authoritative. No subsequent focus callback may switch it back to the previous direction.

### 3.2 Keyboard actions

| Input | Required behavior |
|---|---|
| `A`–`Z` | replace selected cell, then advance within selected entry |
| valid rebus input | replace selected cell atomically, then advance |
| `Backspace` on non-empty cell | clear selected cell, then move backward within selected entry |
| `Backspace` on empty cell | move backward, clear the destination if non-empty |
| Arrow parallel to selected direction | move one playable cell in that direction without changing entry direction |
| Arrow orthogonal to selected direction | switch direction at a crossing and remain on the cell; otherwise move spatially according to the documented fallback |
| `Space` at a crossing | toggle direction without entering a character |
| `Tab` | select first open cell of next entry in current direction |
| `Shift+Tab` | select first open cell of previous entry in current direction |
| `Enter` | open the accessible rebus editor when rebus input is available; never use a browser prompt |
| `Escape` | close an open editor/dialog and restore grid focus; otherwise no destructive action |

At the end of a completely filled entry, forward typing advances to the first open cell of the next entry in the same direction. It does not claim the entry is correct.

### 3.3 Selection acceptance tests

1. Begin Down, click an Across clue whose first open cell is a different crossing, type two characters, and observe horizontal placement.
2. Begin Across, click a Down clue whose first open cell is a different crossing, type two characters, and observe vertical placement.
3. Fill the first character of an entry, click its clue, and observe selection on its second character.
4. Click the selected crossing cell twice and observe exactly one direction change per click without cell movement.
5. Programmatically focus the selected input after any action and observe no semantic-state change.

---

## 4. Check and correction state machine

### 4.1 Check button

| Current mode | Player action | Evaluation | Counter | Score | Next mode |
|---|---|---:|---:|---:|---|
| off | press Check | evaluate requested scope once | +1 check | −10 only if at least one non-empty value is wrong | on |
| on | press Hide check | none | no change | no change | off |

The visible label must describe the next action. `aria-pressed` or an equivalent state is required, but it does not replace visible text.

In the first parity release, the exposed scope is the whole puzzle. The domain may retain cell and entry scopes, but unshipped scopes must not complicate the primary button.

### 4.2 Evaluation rules

For each cell in scope:

- empty → `empty`, rendered neutral;
- entered value equals the solution → `correct`;
- entered value differs from the solution → `incorrect`;
- value supplied by a Reveal action → `revealed`.

Cells outside the scope remain `unevaluated`. The UI must never compute green as “checked and not incorrect.”

An entry becomes `verified` only when every cell is non-empty and evaluated as `correct` or `revealed`. A fully entered but unevaluated entry is `filled-unverified`. An entry containing any current `incorrect` evaluation is `checked-incorrect`.

### 4.3 Editing while check mode is on

Check mode persists through typing, deletion, paste, and rebus edits.

When one cell changes:

1. only that cell's prior `correct` or `incorrect` evaluation becomes `unevaluated`;
2. all other evaluated cells retain their feedback;
3. any entry relying on the changed cell loses `verified` status until reevaluated;
4. no assistance receipt is created;
5. score and counters do not change.

This deliberately avoids live solution comparison after every keystroke. The player can see which known errors remain without the app leaking whether a replacement character is correct before another Check.

### 4.4 Clear incorrect

While check mode is on and at least one cell is currently `incorrect`, show a distinct **Clear incorrect** action.

Activating it:

1. empties every currently incorrect cell in the current evaluation scope;
2. marks only those cells `unevaluated`;
3. retains all correct/revealed feedback and all other values;
4. keeps check mode on;
5. preserves the current selection when possible, otherwise selects the first cleared cell;
6. changes neither score nor check count.

This recovers the stronger behavior from the legacy role/mobile client without coupling the solver to multiplayer.

### 4.5 Rechecking

To perform a new evaluation, the player hides check feedback and presses Check again. A new evaluation receipt is created. If the new evaluation has no incorrect entered values, score does not change. If it has at least one, the legacy-parity penalty applies once.

The application may later add a visible **Recheck** command, but it must have the same receipt and scoring semantics and requires a separate owner-approved UI change.

### 4.6 Check acceptance tests

1. Check an empty puzzle: every empty cell is neutral, Checks becomes 1, Score remains 100.
2. Press the button again: check feedback hides, Checks remains 1, Score remains 100.
3. Check one wrong letter: that cell is incorrect, Checks becomes 1, Score becomes 90.
4. Delete that wrong letter: it becomes neutral, unrelated wrong cells remain marked, mode remains on.
5. Replace one wrong letter: only that cell becomes unevaluated; unrelated error feedback remains.
6. Activate Clear incorrect with three wrong cells: those three become empty and neutral, mode remains on, score and count remain unchanged.
7. Check a puzzle containing only correct entered letters and empty cells: entered letters are correct, empty cells neutral, score unchanged.

---

## 5. Scoring and counters

The parity score begins at 100 and never falls below 0.

| Receipt | Score delta | Counter behavior |
|---|---:|---|
| check evaluation with one or more wrong entered values | −10 | Checks +1 |
| check evaluation with only correct/empty values | 0 | Checks +1 |
| hide check feedback | 0 | none |
| clear incorrect | 0 | none |
| reveal one previously empty cell | −20 | Reveals +1 cell |
| reveal an already filled cell | 0 | none |
| reveal whole puzzle | −50 flat | Reveals + number of newly revealed cells |

Score is a projection of assistance receipts, not a mutable side effect. Replaying a receipt during hydration must not apply its penalty twice. Every receipt therefore needs stable identity or inclusion in a versioned session event log.

If entry reveal is exposed, it requires a separately decided penalty before release. Do not guess one from the cell or puzzle values.

Completion history stores the final score, check count, reveal-cell count, active time, assistance receipts or their audit summary, puzzle ID, title, authors, difficulty/day, and completion type.

---

## 6. Clue lifecycle and the spine

### 6.1 Visibility

A clue never disappears merely because all its cells contain characters.

| Entry state | Clue behavior |
|---|---|
| empty | full clue and empty answer pattern |
| in-progress | full clue and linked entered pattern |
| filled-unverified | full clue; subtle “filled” state allowed, never success green |
| checked-incorrect | full clue with localized incorrect cells |
| verified | remains available; may become compactable under explicit presentation policy |

Verified clues must remain recoverable and keyboard reachable. The first parity implementation should keep all clues rendered and use a reduced-emphasis verified style instead of removing rows. Automatic compaction is a later, separately testable enhancement.

The layout density threshold, if retained, counts verified entries—not filled entries.

### 6.2 Stable lanes

Across and Down each have two stable lanes. An entry's lane and seam side derive from a stable layout projection keyed by entry ID. Filtering, verification, checking, or correcting may not change that assignment.

Do not use `:nth-child` over a filtered list for semantic geometry. DOM order may be used for reading order, but lane/seam metadata must be explicit.

### 6.3 Highlight circuit

Visual states are projected from semantic selection:

1. selected cell;
2. selected entry;
3. crossing/affected entry;
4. evaluated correct, incorrect, or revealed state;
5. ordinary filled or empty state.

The selected cell must remain distinguishable when it is also correct, incorrect, circled, shaded, or rebus. Color is never the only carrier of direction or correctness.

The unexplained remake-only orange/blue 3 px inset edge is removed for the parity release. A future seam accent requires stable lane metadata and an explicit meaning; direction identity and “crossing affected” may not be conflated.

### 6.4 Background direction words

The `ACROSS` and `DOWN` words are field identity, not decoration that competes with clues.

Required properties:

- the complete word is recognizable in each field at the target desktop panorama;
- the word is contained by its clue field and never clips into the grid or controls;
- every clue, answer mini-cell, and state marker remains legible over it;
- scale derives from the clue container, with bounded minimum and maximum values;
- opacity is subordinate in both themes and in forced-colors mode;
- narrow layouts may replace the watermark with a compact heading rather than fragment it;
- tests assert containment, contrast, and screenshots—not a magic `240px` value.

### 6.5 Control labels

Primary controls use visible sentence-case labels such as **Check**, **Hide check**, **Clear incorrect**, **Reveal**, and **Pause**.

- visible text is the top paint layer in every hover, active, disabled, and focus state;
- no pseudo-element may cover the label;
- text meets WCAG AA contrast in day/night and forced-color themes;
- labels remain readable at 200% browser zoom and 320 CSS px width;
- `title` text and icons are supplementary, never the only name;
- a disabled action explains its state through accessible description where needed.

---

## 7. Completion, reveal, and history

### 7.1 Completion definitions

- **Filled:** every playable cell is non-empty.
- **Verified complete:** every playable cell exactly matches the authoritative solution.
- **Revealed complete:** the puzzle was completed by Reveal puzzle.
- **Skipped/archived:** the player intentionally stopped without a verified solution.

Only verified or revealed completion may create a solved-history record. An incomplete puzzle may never silently be recorded as solved.

The existing **Complete** action must either:

1. validate exact completion and report remaining work, or
2. be renamed **Skip puzzle** / **Archive puzzle**, require confirmation, and record a non-solve outcome.

Exact final-letter auto-detection from the remake may remain, provided it is idempotent, does not expose solution content before completion, and does not trap keyboard focus.

### 7.2 Reveal

Reveal puzzle requires confirmation, fills only the solution, emits one puzzle-reveal receipt, applies the flat −50 parity penalty, records how many cells were newly revealed, and records revealed completion.

Cell reveal should be an explicit accessible action rather than a hidden right-click gesture. It reveals only an empty cell and applies the −20 penalty once. Repeated reveal of the same or already filled cell is a no-op.

### 7.3 Rebus

The rebus editor is an authored dialog or popover with a visible label, validation, Save and Cancel actions, Enter/Escape behavior, touch support, focus containment, and focus restoration. `window.prompt` is not an acceptable production interaction.

---

## 8. Persistence contract

Persist semantic state, not CSS classes:

- puzzle and schema version;
- values;
- atomic selection;
- active-time timer state;
- check presentation, evaluation values, and receipt identity;
- assistance receipts;
- verified entry derivation inputs;
- pause state and player preferences.

On hydrate, invalid selection is repaired once at the repository/domain boundary. Focus then follows repaired selection. Assistance receipts are never replayed as new player actions.

Changing a cell after reload follows the same local-invalidation rule as changing it before reload. If coherent evaluation persistence cannot ship in the first patch, discard the whole evaluation receipt on load and start in check mode off; never restore green without restoring the matching incorrect set.

---

## 9. Accessibility and responsive behavior

The grid, the selected clue, and the linked answer pattern form one composite solving control.

- announce clue number, direction, clue text, position within answer, current value, and evaluation state without repeating the entire clue on every arrow move;
- keep a single predictable grid tab stop or an equivalent roving-focus design;
- use Tab/Shift+Tab for entry navigation only while grid solving has focus, with a documented escape path to page controls;
- return focus after dialogs and clue activation;
- ensure incorrect/correct states have non-color affordances and accessible descriptions;
- keep the selected clue and answer pattern visible in the grid-first narrow layout;
- honor reduced motion and forced colors;
- avoid continuous blur, animation, or repaint-heavy glow effects during ordinary play.

The wide desktop panorama remains the signature composition. Narrow layouts may reorganize it, but they may not discard linked clue patterns or make direction ambiguous.

---

## 10. Release-level journeys

These journeys are mandatory in addition to unit tests:

### Journey A — authoritative direction

1. Start on 1-Across.
2. Click a Down clue with a different crossing as its first open cell.
3. Type two letters.
4. Assert Down remains selected and letters occupy consecutive Down cells.

Repeat symmetrically from Down to Across.

### Journey B — harmless check

1. Enter two correct letters; leave the rest empty.
2. Press Check.
3. Assert those two are confirmed, all empties neutral, Checks +1, Score unchanged.
4. Press Hide check.
5. Assert marks hidden with no counter or score change.

### Journey C — correction memory

1. Enter at least three wrong letters in different entries.
2. Check and observe all three errors.
3. Delete one and replace another.
4. Assert only edited cells become neutral; the third remains incorrect.
5. Clear incorrect and assert remaining known errors are emptied without leaving check mode.

### Journey D — clue continuity

1. Fill an answer incorrectly.
2. Assert its clue remains in the same lane and is still reachable.
3. Check, correct, and verify it.
4. Assert any reduced-emphasis state is reversible and does not move unrelated clues.

### Journey E — score audit

1. Perform a no-error check, a wrong check, hide feedback, reveal one cell, and reveal puzzle.
2. Assert a receipt for each real assistance event and no receipt for hiding.
3. Assert the score calculation is reproducible after reload and no receipt is counted twice.

### Journey F — visual legibility

At desktop panorama, 200% zoom, 320 CSS px width, day theme, night theme, reduced motion, and forced colors:

- all primary action labels are readable;
- field identity remains clear;
- the selected entry, crossing entry, selected cell, and error state remain distinguishable;
- watermark bounds stay inside the corresponding clue field;
- no clue text or linked answer pattern is obscured.

---

## 11. Definition of done

The parity slice is complete only when:

- every release-level journey passes against legal deterministic fixtures;
- owner-approved differences are tagged in differential tests instead of silently replacing legacy expectations;
- obsolete assertions that encode global error clearing, filled-clue disappearance, or exact 240 px watermarks are replaced with this contract;
- score, counters, completion, and persistence are proven by domain tests plus at least one reload journey;
- browser evidence exists for both direction transitions, not only the initial first-cell special case;
- no visual rule derives semantic meaning from filtered child position;
- the user can complete an entire puzzle by keyboard and can understand Check mode without relying on color.
