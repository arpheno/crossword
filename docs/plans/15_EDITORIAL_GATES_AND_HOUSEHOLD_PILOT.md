# Editorial gates and a household crossword pilot

Status: proposed implementation plan, 2026-09-05. Research reviewed against the
current repository; the changes below have not been implemented by this document.

## Decision

Adopt the report's central insight: **a confirmed false clue or unacceptable
crossing cannot be offset by a high average fill score or an attractive theme.**
Implement an evidence-bearing editorial report, a small review workflow, and a
publication gate for pilot puzzles. Use them to produce one reviewed puzzle, then
ten fresh puzzles, and measure how much editing and solving pleasure they produce.

Do not implement the submitted report verbatim. Its useful editorial direction is
mixed with unsupported thresholds, overclaimed automation, problematic experiments,
and mistakes in its supposedly validated examples. In particular, deterministic
grid validity is not a guarantee of human answerability or enjoyment.

This plan makes the evaluation work in
[plan 13](13_MEANINGFUL_PERSONALIZATION_AND_CLUE_CATALOG.md) concrete. It supplies
quality evidence for [model training](14_SPECIALIZED_CROSSWORD_MODEL_TRAINING.md)
and [construction experiments](12_RUST_WASM_CONSTRUCTION_ENGINE.md), without
requiring either experiment to finish first. It preserves current weekday recipes,
browser inference, local privacy, and the signature solver interface.

## 1. Source review: retain, revise, reject

Input: the user-supplied report titled *Architectural and Editorial Standard for
Recreational American-Style Crossword Generation*. Its supplied text has SHA-256:

```text
d8372a27a0ce97621f778ed90039257b9e102b22691a854222ea963a77d724d5
```

The pasted version names sources but supplies no usable research URLs beyond the
JSON Schema identifier. Attribution to a book or paper does not verify the report's
particular rule. The checks below distinguish source evidence from project policy.

| Report recommendation or claim | Disposition | Implementation consequence |
| --- | --- | --- |
| Serious defects cannot be averaged away | Retain as product policy | Confirmed blocking findings require correction; sparkle is scored afterward |
| A curated sense/clue inventory improves control | Retain as a design direction | Build a small reviewed pilot using plan 13's records; measure actual yield |
| Insight research proves enjoyment follows a minimax law | Reject the claimed proof | Worst-defect protection is an editorial choice, not an established psychological equation |
| Trie substitutions guarantee crossing fairness | Reject | Candidate retrieval is a diagnostic; it cannot prove what a household knows or can infer |
| Porter stemming identifies forbidden etymological duplicates | Reject | Exact repeats remain deterministic; possible family repetition needs lexical evidence and review |
| All proper-name intersections are defects | Revise | Review clue/sense, alternatives, actual letter, and intended audience; names alone do not settle fairness |
| Every cut vertex is a critical failure; require two paths per quadrant | Reject as a hard gate | Connectivity remains structural; articulation and regional footholds are diagnostics to investigate |
| Universal 0–100 tiers, 18% names, two weak entries, fixed question-mark shares | Do not adopt as facts | Define a versioned pilot policy from examples and measure tradeoffs; external scoring systems need explicit mappings |
| Three-second fills, 200–250 ms local clue work, five-minute editing | Unmeasured hypotheses | Record baseline distributions before selecting resource or effort targets |
| Permanently remove open-ended local generation if catalog selection wins | Reject | Retain plan 13's bounded, grounded runtime path for gaps, themes, and unsuitable catalog clues |
| Lower the lexical floor automatically when search is slow | Reject | Return a typed failure, retry a layout, or change an explicit policy version; never silently relax acceptance |
| Zero shared answers across ten puzzles | Revise | Track and balance exposure; avoid repeated exact clues and distinctive theme answers without excluding every staple |
| One player's unfamiliarity establishes an objective Natick | Revise | Record a player-specific fairness incident and adjudicate evidence rather than generalizing unfamiliarity |
| Every theme requires a symmetrically placed revealer | Reject as universal | Theme-specific recipes decide whether a revealer is useful or required |

### What the primary checks actually support

- The cited [Friedlander and Fine article](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.00904/full)
  is a 2018 hypothesis/theory discussion of insight through cryptic crosswords.
  It is relevant to the pleasure of discovery, but does not establish this report's
  quantitative thresholds or a minimax guarantee for American-style puzzles.
- [Snowball's own documentation](https://snowballstem.org/) describes stemming for
  information retrieval and explicitly distinguishes it from recovering all shared
  linguistic roots. A stemmer cannot act as the proposed etymological veto oracle.
- [Spread the Word(list)'s FAQ](https://www.spreadthewordlist.com/faq) describes
  cleanliness scores largely based on frequency and venue; even entries scored 50
  may need fair crossings. Its [older scoring guide](https://www.spreadthewordlist.com/wordlist-old)
  warns that a minimum score does not ensure editorial acceptance. These scores
  must not be presented as calibrated enjoyment probabilities.
- Its [current distribution page](https://www.spreadthewordlist.com/) states
  CC BY-NC-SA 4.0 and describes permitted uses. That is a real source decision to
  assess under plans 13/14, not an automatically approved unrestricted input.
  The FAQ also describes provider-derived inputs; investigate compatibility with
  this project's source policy before importing it.
- [Merriam-Webster lists JUJUTSU among accepted variants](https://www.merriam-webster.com/dictionary/jujutsu).
  This does not settle every editor's signaling preference, but contradicts treating
  that spelling as intrinsically invalid or obviously wrong English.

These are checks of the consequential claims, not a certification of every citation
in the report. No external lexicon or puzzle archive was acquired for this plan.

### Correct the report's examples before using them as fixtures

- `ON THE HOUSE` normalizes to `ONTHEHOUSE`, length **10**, not 11.
- `A TASTE` has six cells, contradicting the report's own five-cell partial rule.
- `SWEETHEART` and `SWEETMEATS` have ten cells; `SWEET TALK` has nine. A proposed
  substitution is not a valid repair merely because it sounds better; even equal
  lengths require crossing checks.
- `STRIKE` does not mean walking up to the plate. The report's double-definition
  example needs revision; the baseball sense concerns a pitch/result, as described
  in the [dictionary entry](https://www.merriam-webster.com/dictionary/strike).
- The KYL/TYR example warrants audience-sensitive investigation. Replacing it with
  ALL/ALF does not prove a valid repair at the same positions, and ALF remains a
  proper-name reference. Recompute the actual crossings.
- The corner repair describes coordinates without a complete mask and assignment.
  It cannot substantiate the report's claim that all miniature grids were validated.

Use the semantic failure in TALLOW / “Speak quietly in church” as a negative case.
Do not adopt all twelve examples as gold-standard positive labels.

## 2. Current repository seams

Verified against the working tree on 2026-09-05; check again before implementation
because concurrent construction work is in progress.

| Existing seam | Current behavior | Planned use |
| --- | --- | --- |
| `packages/construction/src/topology.ts` | Derives slots/intersections and checks runs, checked cells, and connected white cells | Reuse structural facts; do not build a second grid validator |
| `packages/construction/src/csp.ts` | Enforces fill constraints and configured poor-entry quotas | Keep hard validity; use improved lexical annotations through its settled contract |
| `packages/construction/src/quality.ts` | Most of the aggregate score is fixed by layout | Preserve as a legacy diagnostic; do not label it editorial certification |
| `packages/application/src/constructPuzzle.ts` | Assembles fills and clue ladders; missing senses can still become `web2:WORD` labels | Insert evaluation before pilot publication; unresolved semantic records require review |
| `packages/application/src/clueCatalog.ts` | Checks basic draft shape and primary/nudge presence | Add evidence-aware applicability through plan 13, not an independent catalog system |
| `packages/application/src/manifest.ts` | Selects clues partly by entry index; validates and hashes manifests | Evaluate the actual selected clue/nudge set; do not approve unused alternatives |
| `packages/domain/src/puzzle.ts` | `QualityReport` contains score, thresholds, and validator names | Keep compatibility; begin with a separate detailed report rather than silently changing V1 |
| `GenerationReceipt.fill` | Now carries optional fill telemetry | Reuse it; do not reopen the already implemented telemetry handoff |

The existing manifest finalizer proves structural validity and integrity. It does
not prove that clue meanings, grammar, or crossings are fair to a particular player.
This distinction must remain visible in diagnostics and release decisions.

## 3. Three layers of judgment

### A. Deterministic validity

Reuse checks for dimensions, legal cells, slot lengths, crossing equality, answer
uniqueness, locks, exclusions, and required checked-cell/connectivity rules.
Symmetry and word-count limits belong to an explicit recipe and its validator;
their inclusion in a JSON report is not evidence that the check ran.

Add genuinely mechanical checks where warranted: missing selected clue, missing
required recovery clue, exact duplicate clue text, stale evidence digests, unresolved
references, invalid enumerations, and known source-policy failures. Specify narrow
normalization rules and exceptions. Do not use a raw substring match as a complete
answer-leakage detector or a shared substring as proof of root duplication.

### B. Semantic/editorial assessment

Record intended sense/form-level meaning, factual support, grammatical fit,
abbreviation/locale conventions, defensible wordplay, partial naturalness, and
recovery usefulness. Retrieval and model judges may propose findings; a fluent
explanation is not proof. Automated grammar extraction and substitution tests
are fallible, especially for conversational and punning clues.

A semantic assessment can be supported, contradicted, or unresolved. Confirmed
false meanings require revision even when crossings reveal the answer. Suspected
problems go to review. For the initial pilot, a human reviews every entry and
primary/recovery pair; a small number of sampled checks is not sufficient approval
for the unreviewed rest of that puzzle.

### C. Quality and enjoyment

Rate lexical naturalness, lively long entries, clue variety, satisfying discovery,
theme coherence when applicable, and overall experience. Track defects separately
from averages. Store unknown ratings as unknown, not zero or a guessed midpoint.

Use a small anchored rubric: 1 = conspicuous weakness, 3 = solid ordinary example,
5 = particularly satisfying example, with written examples for each dimension.
These are editorial ratings, not interval-scale psychological measurements. Keep
dimension ratings separate until an aggregate proves useful.

No layer guarantees enjoyment. The goal is to reduce preventable defects and obtain
honest evidence from actual solving.

## 4. Report and review contract

Propose `EditorialReportV1` as a local sidecar to the candidate/manifest. Names and
module placement below are implementation proposals, not existing APIs.

```ts
type AssessmentState = 'supported' | 'contradicted' | 'unresolved' | 'not-applicable';

type Assessment = Readonly<{
  checkId: string;
  checkVersion: string;
  entryIds: readonly string[];
  cellIds: readonly string[];
  method: 'deterministic' | 'retrieval' | 'model' | 'human';
  state: AssessmentState;
  evidenceIds: readonly string[];
  reason: string;
}>;

type Finding = Readonly<{
  id: string;
  ruleId: string;
  assessmentIds: readonly string[];
  severity: 'blocking' | 'review' | 'advisory';
  status: 'open' | 'corrected' | 'dismissed-with-evidence';
  resolutionEvidenceIds: readonly string[];
}>;

type EditorialReportV1 = Readonly<{
  schemaVersion: 1;
  snapshotDigest: string;
  recipeId: string;
  policyVersion: string;
  sourceVersions: Readonly<Record<string, string>>;
  assessments: readonly Assessment[];
  findings: readonly Finding[];
  requiredCheckIds: readonly string[];
  coverage: { totalEntries: number; reviewedEntries: number };
  metrics: Readonly<Record<string, number | null>>;
  verdict: 'review-required' | 'revise-clues' | 'refill' | 'rejected' | 'ready';
}>;
```

Implement strict parsing and relational checks, not just these TypeScript shapes:

- IDs are unique; evidence, assessment, entry, and cell references resolve.
- Versions and digests are present and match actual artifacts.
- Numeric counts are nonnegative bounded integers; ratios have specified units;
  unavailable values are null. Strings and collections have size limits.
- `not-applicable` requires a policy-supported reason. It cannot bypass a required
  check. Missing assessments, failed retrieval, and missing ratings never become pass.
- Evidence records carry method-specific provenance and the exact scope reviewed.
  A model-only semantic judgment cannot satisfy the pilot's human review requirement.
- The verdict is derived by a pure policy function, not accepted from a model or
  trusted because a JSON file says `ready`. Dismissing a mistaken flag requires
  evidence; a real blocking defect cannot be overridden by an aesthetic score.

### Snapshot and lifecycle

Hash canonical candidate content covering layout, answers, selected clues/nudges,
theme context, referenced meanings/facts, catalog versions, and recipe/policy
versions. Any relevant edit invalidates dependent assessments. Recheck the snapshot
immediately before publication, including after asynchronous model/reviewer work.

Keep review timestamps and mutable workflow metadata outside the content snapshot.
Avoid circular hashing: the sidecar can reference the finalized puzzle integrity
digest after publication, but do not simultaneously embed a sidecar hash in the
content it hashes. Define canonical serialization once.

Begin with file-based reports and review imports under offline tools. If reports
later enter IndexedDB or exported puzzle schemas, follow ADR 0005's migration and
archive validation ownership. Keep identifiable feedback, audience notes, and full
review evidence out of publicly exported puzzle manifests.

## 5. Crossing risk and regional access

Assess a crossing using both selected clues, intended senses, answer alternatives,
the crossing positions, intended audience, and available evidence. A function that
accepts only two answer strings lacks the required context.

```ts
evaluateCrossingRisk({
  across, down, positions, selectedClues,
  senseRecords, alternativeAnswers, audiencePolicy, evidence
}): CrossingAssessment
```

The result must distinguish supported concerns, unknown coverage, and a reviewed
acceptable crossing. It may include alternative letters and their provenance;
it must not declare the crossing universally safe because a trie returned one hit.
The dictionary may be incomplete, and an editor's fully known solution is not the
information a solver possesses during play.

Use explicit named graph models:

- White-cell adjacency graph: structural connectivity.
- Entry-intersection graph: one vertex per entry, one edge per crossing, with
  direction and position metadata; useful for region diagnostics.

A cut vertex in the second graph is a possible flow concern, not proof of an
inaccessible region. Solvers can read and solve clues inside a region directly.
Conversely, a highly connected graph can have no useful footholds. Test both kinds
of examples. Analyze a fixed layout once; do not add graph work to every CSP node.

For the pilot, have the editor identify several plausible footholds distributed
through the actual regions and inspect difficult clusters. Quadrants can help
visualization but are not the initial hard quota. Move from annotations to prediction
only after evidence supports the particular accessibility estimate.

## 6. A bounded publication and repair loop

```text
candidate fill + selected clue/nudge set
  -> structural checks
  -> semantic evidence and contextual diagnostics
  -> report + human review where required
  -> revise clues OR request a bounded refill OR reject
  -> recompute affected checks and snapshot
  -> ready under the pilot policy
  -> finalize integrity -> enqueue immutable puzzle
```

Start with a provisional budget of two clue-repair rounds and the recipe's existing
fill-attempt budget. Count nested calls so retries cannot multiply unnoticed. These
budgets are operational choices to revise from measurements, not research findings.

Preserve accepted clue work only when its answer, sense, facts, context, and policy
remain compatible. A changed neighboring clue or theme may invalidate an otherwise
unchanged clue. A layout/answer edit must recheck crossings and references.

Search exhaustion returns a typed unavailable/review-required result. It must not
silently lower the lexical floor, create a filler definition, discard a required
check, or use a nudge as the primary merely because a valid primary is missing.

Keep the source and runtime contracts in plan 13: ordinary catalog clues are
preferred when suitable, while missing and bespoke material can receive grounded,
bounded local generation. Unsupported generation leaves existing queued puzzles
playable; it does not secretly switch to a different constructor architecture.

## 7. First acceptance fixtures

These are specifications for new tests, not claims that the tests already exist.
Use original/synthetic data and reviewed semantic labels.

| Fixture | Expected behavior |
| --- | --- |
| `ON THE HOUSE` in a ten-cell slot versus an eleven-cell slot | Normalized length passes only for ten; no inference needed |
| TALLOW with the report's invented speaking sense | Confirmed semantic contradiction blocks publication; a supported fat-related clue can repair it |
| ELEVATED with an explicitly verbal, present-tense “Raise” clue | Grammar concern requires correction/adjudication; a past-tense repair is rechecked |
| A fair clue with several plausible answers before crossings | Ambiguity alone does not reject it |
| Two obscure names with incomplete alternative retrieval | `review-required`, not automatically safe or objectively impossible |
| Missing sense/fact record and empty retrieval results | Unknown remains unresolved; no `hallucination_detected: false` default |
| Exact repeated answer versus possible stem-family overlap | Exact-repeat validator rejects; family evidence is routed through declared policy |
| Accepted transliteration variant | Eligibility/signaling assessed against lexical and locale evidence, not a spelling assumption |
| Bottleneck layout with accessible internal clues | Structural validity remains separate from advisory flow concern |
| Well-connected layout with all difficult clues in one region | Detect/review the clue distribution problem despite graph connectivity |
| Approved candidate followed by clue, answer, or fact-version edit | Relevant approval becomes stale; publication cannot reuse it |
| High aesthetic score plus one confirmed blocking finding | Verdict never becomes `ready` |
| Failed final clue after other clues succeeded | Retain compatible accepted work; retry only unresolved requirements |
| Repeat exposure in a later pilot puzzle | Record answer/clue recurrence without automatically excluding all staples |

Add parser adversaries for invented evidence IDs, negative counts, unknown fields,
incorrect units, out-of-range values, absent required checks, and model-authored
approval masquerading as human review. Target meaningful boundary behaviors rather
than tests that merely mirror an implementation's branches.

## 8. Three experiments, corrected

### E1 — Curated eligibility and weak-entry quotas

Use one approved pilot vocabulary with explicit ratings and one independent small
layout bank. Never reinterpret the current 0–1 letter heuristic as a validated
0–100 constructor scale. Begin with three layouts and ten recorded seeds per
condition; widen if informative. These counts are a starting budget.

Compare the existing ranking over that same eligible vocabulary, reviewed exclusion
of clearly unacceptable entries, and a bounded quota for marginal-but-allowed fill.
Keep candidate versions, layouts, node budgets, and clue evidence fixed. Report
fill completion, human-accepted fill yield, worst-entry findings, raw failures,
time to acceptance, and index-build costs. Cluster results by layout; seeds from
one layout are not broad evidence of generality.

If tighter policy improves quality but destroys yield, investigate missing useful
vocabulary or layout choice. Any lower floor is a new explicit condition requiring
editorial acceptance, not an automatic production fallback.

### E2 — Grounded drafting versus catalog selection

The report's answer-only drafting versus four already reviewed options comparison
confounds grounding, available information, and task difficulty. Keep a weak current
baseline for diagnosis, then compare grounded generation, deterministic selection
from reviewed variants, and model-assisted selection from those same variants.

Use 100 held-out answer/sense packets initially, with consistent facts, locale,
technique requirements, candidate/retry budgets, and independent review. Separate
catalog-ready from genuinely missing/bespoke cases. Measure raw errors, accepted
yield, unnecessary rejections, reviewer effort, diversity, and worker end-to-end
time. Tokens per second alone is not selection latency.

If deterministic catalog selection matches model selection, remove unnecessary
selection calls. If grounded drafting helps missing cases, retain it. No small
sample can prove zero hallucinations or justify permanently removing a capability
the experiment never tested. Follow plan 14 for later specialist comparisons.

### E3 — Regional footholds and actual solving

First compare alternative clue distributions on identical grids through editorial
inspection. For household solving, use fresh matched grids and counterbalanced
policies so each person sees a solution only once. Joint household play counts as
one session, not two independent observations.

Compare the baseline clue mix with editor-guided regional access. Record optional
stall reports, fairness incidents, assists, enjoyment, and willingness to solve
another puzzle. A long gap between keystrokes is not sufficient evidence of a stall.

Treat the first ten puzzles as qualitative diagnosis. Do not promise an 80%
abandonment reduction or apply an unplanned significance test to correlated sessions.
Predeclare any later statistical design and account for repeated solvers and grids.
Stop exposing players to a condition with confirmed serious defects; retain those
failures in the report rather than hiding them through early stopping.

## 9. Household pilot and review workflow

Use a deliberately narrow accessible 15x15 recipe. Keep its identity stable; the
report's Gentle/Balanced/Recondite bands do not replace existing day contracts.
Themed and themeless results must be labeled and interpreted separately.

First checkpoint: one complete candidate receives an independent editorial pass
and can be solved without advance answer exposure. If the owner edits it, use
another fresh puzzle for the owner's solving feedback; never present an already
studied grid as a blind solve.

Next prepare ten fresh puzzles. Track common answer recurrence, exact clue exposure,
distinctive phrases, themes, order, and participants. Avoid repeated exact clues
where practical, and keep distinctive theme answers fresh; do not distort normal
fill by requiring disjoint vocabularies across the batch.

The editor records separate preparation, checking, fact lookup, clue revision,
refill, and final review time. Record every rejected generation attempt. Establish
the actual baseline before setting an editing-effort target; five minutes is not
an initial pass/fail guarantee.

Offer a short optional after-puzzle form:

- Completed / used assistance / stopped / interrupted for another reason.
- Enjoyment, fairness, and frustration, each on a labeled 1–5 scale or skipped.
- Would you choose another puzzle like this? Yes / maybe / no.
- One memorable clue or discovery, if any.
- One frustrating entry or region, if any; no requirement to reconstruct all errors.

Keep feedback local and separate from public puzzle metadata. A solver report opens
an incident; the editor checks the actual clue, alternate answers, crossing support,
and audience fit. Preserve disagreements and unknowns. Do not silently transform
feedback into mastery or cognitive-state estimates.

## 10. Ordered implementation packages

Proposed files are owned only once assigned. Read current `AGENTS.md`, inspect the
dirty worktree, and preserve other work. Do not use this plan as authorization to
rewrite App, voice, Rust, persistence, or the learner model.

| Package | Owned responsibility and proposed artifacts | Dependencies | Acceptance and rollback |
| --- | --- | --- | --- |
| P0: contract | New editorial ADR proposal; `packages/domain/src/editorialReport.ts`; pure schema/verdict tests | Existing domain/policy boundaries | Unknown cannot pass, critical findings cannot be averaged away, IDs/versions checked; no runtime change yet |
| P1: fixtures | Original evaluation packets and expected findings under `tools/clue-evals/fixtures/` | P0 | Mechanically validate lengths/references; review semantic labels; quarantine disputed examples |
| P2: report tool | CLI report generation and review import/export under `tools/clue-evals/` | P0/P1 | Evaluate a complete existing candidate, record all unresolved checks, apply exact-snapshot review; can remain offline-only |
| P3: pilot annotations | Small eligible answer/sense/fact/clue set and source receipts using plan 13's agreed shapes | Source decision and P2 | Selected pilot entries have real reviewed meanings; unsuitable raw dictionary material cannot be silently promoted |
| P4: diagnostics | Narrow clue checks and contextual crossing/region assessment in application/construction owners | P1/P3 | Positive, negative, and unknown cases behave correctly; new predictive diagnostics remain advisory until supported |
| P5: publication integration | `constructPuzzle.ts`, manifest integration, dedicated pilot-queue adapter through designated owners | P0–P4 | Evaluates selected clues, blocks unresolved pilot approval, invalidates edits, preserves cancellation and compatible completed work |
| P6: fresh pilot | Ten-puzzle report, lightweight local feedback, three experiments | One reviewed puzzle and P5 | Report accepted yield, raw failures, edit effort, and solver feedback without overstating inference |

Start P5 behind an explicit pilot route, keeping current solving and historical
imports compatible. A missing historical editorial sidecar means “not reviewed
under this policy,” not a corrupted old puzzle. Rolling back the new gate disables
publication into the reviewed pilot queue; it must not relabel unreviewed output
as reviewed. Previously approved immutable puzzles remain playable.

Extend persisted/public formats only in the designated ADR/migration slice. A file
tool and small annotation pack should let P2/P3 deliver one reviewed puzzle before
a dashboard, broad catalog, or predicted fairness system exists.

## 11. First implementation slice and completion evidence

An initial week should prioritize a complete review loop, not five days of new
structural vetoes. Order the work as follows; duration depends on source/reviewer
availability and is not promised:

1. Define report states, evidence references, snapshot digest, and pure verdict
   rules; add focused adversarial fixtures.
2. Emit an honest report from an existing complete candidate, reusing topology and
   fill telemetry. Surface missing semantic evidence explicitly.
3. Build a minimal review import/export operation and curate the actual answers,
   primary clues, and nudges for one pilot candidate with approved provenance.
4. Re-evaluate that exact snapshot and make the reviewed artifact available for
   fresh solving through a bounded pilot path.
5. Review the first solve and editing log; choose the next fix from observed defects.

The plan is implemented when:

- Reports distinguish mechanical checks, semantic evidence, uncertainty, and human
  enjoyment; all required checks have traceable coverage.
- Known serious defects and stale approvals cannot enter the reviewed queue.
- Fair ambiguity, legitimate variants, and accessible regions are not rejected
  by overbroad proxy rules.
- Ten fresh reviewed puzzles have reported generation yield, editing effort,
  fairness incidents, and optional enjoyment feedback.
- Lexical policies, clue-selection changes, and later training receive concrete
  positive/negative evidence from those outcomes.
- Relevant domain/application tests, construction properties where changed,
  browser integration checks, content scans, and required repository gates pass.

The report's useful contribution is the insistence on protecting solver trust.
This implementation earns that trust through evidence and correction, without
claiming that a collection of heuristics can guarantee a pleasurable solve.
