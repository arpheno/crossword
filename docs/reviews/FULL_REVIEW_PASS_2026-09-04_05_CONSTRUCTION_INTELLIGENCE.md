# Full review increment 05: construction intelligence delta

Date: 2026-09-04

Priority: fifth by attention gap, first by raw algorithmic difficulty

Reasoning tier: superintelligence for objective design, clue grounding, and evaluation

## Outcome

Construction has already received hundreds of lines of detailed review and substantial implementation work. It therefore comes after the neglected infrastructure areas in this pass. It still contains the tasks most likely to benefit from exceptional reasoning: defining an editorial objective, coupling theme and topology, grounding clue senses, and proving quality across a representative benchmark.

Do not commission another generic construction rewrite. Preserve the repairs already made and target the remaining decision points with ablations and measurable receipts.

## What changed since earlier reviews

These previously identified issues now have implementation evidence and should not be reopened without a failing test:

- all-different propagation seeds its initial queue in `packages/construction/src/csp.ts:591-599`;
- fill results expose termination, optimality, bound, and gap telemetry around `packages/construction/src/csp.ts:717`;
- topology length paging has been repaired;
- model candidate ranking and clue-mix output are now consumed by the application path;
- CSP edge, alignment, anytime, and property coverage is materially broader.

The findings below are the current delta.

## CI-P0-1: the quality objective is not an editorial objective

The current quality score is largely constant for all fills of a fixed topology. `maxCrossings` is available but unused, and staple handling provides only a coarse distinction. The `minimumAssignmentScore` logic in `packages/application/src/constructPuzzle.ts:176-185` behaves as a heuristic lower bound and may switch the search toward the first acceptable solution rather than a calibrated best editorial solution.

Required design:

- separate hard validity, fill quality, clueability, freshness, theme coherence, and learner-fit terms;
- normalize terms so their weights have interpretable ranges;
- keep hard constraints out of a soft weighted sum;
- distinguish a provable solver bound from an editorial proxy score;
- define day-specific acceptance from blinded human judgments, not arbitrary constants.

Acceptance:

- a versioned scorecard explains every term and range;
- a fixed corpus ranks obvious bad/good pairs in the expected order;
- weight ablations show which term changed each decision;
- stopping policy records whether it optimized, hit a budget, or accepted a threshold;
- no metric claims more than it measures.

## CI-P0-2: fill telemetry is dropped before publication

The CSP returns termination reason, `provenOptimal`, nodes, bound, and gap, but `constructPuzzle` largely consumes solution/status and does not preserve the search evidence in the published manifest.

Acceptance:

- construction receipts contain solver version, seed, elapsed budget, node count, termination reason, incumbent score, best bound, and gap where meaningful;
- publication policy distinguishes optimal, budget-limited incumbent, and unproven acceptance;
- UI wording reflects that distinction without exposing solver jargon by default;
- a manifest test verifies canonical serialization.

## CI-P1-1: model confidence is self-reported and uncalibrated

Model-provided confidence currently improves a candidate's score. Language-model confidence in its own structured response is not a calibrated probability and can reward persuasive formatting rather than useful vocabulary.

Acceptance:

- remove self-confidence from ranking, or calibrate it against a held-out labeled set;
- never let it override lexicon legality or hard editorial rules;
- record calibration version and reliability plot if retained;
- ablation compares quality with and without the feature.

## CI-P1-2: generation is not replayable

Inference uses nonzero temperature and does not pass a deterministic engine seed. Putting the puzzle seed in prose does not make sampling reproducible.

Acceptance:

- pass an engine seed when supported and record support status;
- record model revision, sampling parameters, prompt bytes/version, and output digest;
- deterministic CSP consumes canonicalized candidates in stable order;
- replay claims distinguish deterministic reconstruction from best-effort semantic regeneration.

## CI-P1-3: clue generation is serial and loses late work

`packages/application/src/constructPuzzle.ts:242-253` generates clues one entry at a time. A standard grid can require many model turns. A late error may discard substantial completed work, and there is no checkpoint or per-entry retry receipt.

Acceptance:

- choose bounded batching or bounded parallelism compatible with the single model worker;
- checkpoint validated clue results by puzzle/entry/prompt version;
- retry only failed entries with a stable budget;
- progress reports completed/total and current phase through the request-scoped runtime contract;
- cancellation retains no falsely published partial puzzle.

## CI-P1-4: clue validation proves shape, not editorial correctness

The clue path validates response structure but lacks independent checks for answer leakage, alternate-answer ambiguity, factuality, duplicate surfaces, unsuitable abbreviation, part-of-speech mismatch, fairness, and intended-sense alignment.

Acceptance:

- implement deterministic leakage and duplication checks first;
- ground facts and senses in approved local sources where possible;
- create adversarial fixtures for homonyms, inflections, abbreviations, names, and multiword answers;
- uncertain clues enter an explicit review/rewrite loop with a hard retry bound;
- human evaluation is blinded to source and model version.

## CI-P1-5: theme placement is greedy rather than global

Theme suggestions are assigned to early suitable long slots rather than optimized jointly for coherence, symmetry, crossings, and overall fillability. There is no explicit theme-set objective.

Acceptance:

- represent theme entries as a set with relationship evidence and placement constraints;
- search or rank symmetric placement combinations before committing locks;
- reject a clever theme set when it destroys fill quality;
- benchmark themed and themeless construction separately;
- preserve an escape path that produces a declared themeless puzzle rather than a weak pseudo-theme.

## CI-P1-6: construction APIs duplicate intent

`constructOriginalFill` remains exported while the App uses `constructPuzzle`. Their contracts and responsibilities can drift, creating two apparent authorities.

Acceptance:

- designate one application use case as canonical;
- move reusable primitives below it rather than expose competing workflows;
- deprecate and remove the unused entry only after call-site proof;
- update architecture docs and tests in the same change.

## CI-P1-7: learner features are static or unwired

Construction exposes adaptive scoring, but the current App does not carry a real profile and crossing-dependent fields are not computed from live CSP context. Resolve [personalization and provenance](FULL_REVIEW_PASS_2026-09-04_04_PERSONALIZATION_PROVENANCE.md) before tuning learner weights.

Acceptance:

- neutral/no-profile construction remains a supported baseline;
- each profile feature has an ablation;
- feasibility and editorial quality dominate preference;
- a published receipt states exactly which profile version and features were applied.

## CI-P1-8: provenance IDs are not generated by their actual owners

The App can pass a placeholder model ID, prompt versions disagree across layers, and validator lists can describe intended rather than executed checks. This prevents meaningful experiment comparison.

Acceptance:

- each subsystem contributes its own versioned receipt;
- the application composes receipts without relabeling placeholders as facts;
- manifest hashes use canonical serialized data;
- benchmark output groups by exact artifact and configuration.

## Required evaluation program

Use a fixed, provenance-clean corpus of topology/day/seed/profile combinations. At minimum report:

- solve rate and time-to-incumbent;
- termination distribution and optimality gaps;
- fill-quality score distributions and term ablations;
- duplicate/staple/obscurity indicators;
- clue validator failure and rewrite rates;
- blinded human ratings for fairness, delight, and day fit;
- cold and warm model time, peak memory, and cancellation behavior;
- exact configuration and artifact digests.

One successful template is not a construction-quality result. Compare multiple topologies and seeds, preserve failed artifacts, and publish aggregate distributions.

## Implementation sequence

1. Freeze a clean benchmark corpus and reference outputs.
2. Version the current scorecard and record every term.
3. Carry CSP termination/bound/gap data into manifests.
4. Add deterministic clue leakage, duplication, and sense tests.
5. Design the multi-objective score from blinded pairwise labels.
6. Add clue checkpointing and bounded retry/batching.
7. Couple theme-set selection to symmetric placement and fillability.
8. Integrate the approved learner profile only after its contract is complete.
9. Run ablations and human evaluation before changing day graduation claims.

## Model allocation

Reserve a high-reasoning model for:

- score decomposition and stopping semantics;
- theme/topology/fill coupling;
- sense and factual grounding architecture;
- experimental design and interpretation;
- resolving disagreements between solver bounds and editorial metrics.

Luna-class agents can safely implement after those designs:

- manifest plumbing;
- benchmark runners and fixture expansion;
- deterministic validators with exact examples;
- per-entry checkpoint storage;
- charts and report generation from fixed metric definitions.

## Verification gate

```sh
npm run test --workspace @crossword/construction
npm run test --workspace @crossword/application
npm run mutation:construction
make qa
```

Green tests are necessary but not sufficient. Attach the benchmark configuration, aggregate output, and blinded evaluation receipt.

## Closure evidence

Implementation checkpoint 2026-09-05: the current construction slice now
records fill termination/bound/incumbent telemetry in the generation manifest,
pages model candidate lengths to the real broker limit, applies model and
learner preferences only after lexicon eligibility, and enforces the poor-entry
budget during search. `make test`, the production web build, content scan,
Playwright QA, and the configured construction mutation floor pass.

Still open by design: the legal benchmark corpus, independent oracle/differential
runner, A/B/C/D performance report, real browser Wasm smoke, and human editorial
calibration. Those are required before a Wasm promotion or day-graduation claim;
they are not safe to invent from the current fake/local fixtures.
