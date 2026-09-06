# Generation and Testing Review

**Review state:** Second-pass review — current delta is authoritative; older findings retained as an audit trail
**Review snapshots:** first pass at `v2@ccd3450`; construction re-audited at `v2@3ea7d72`; application/UI re-audited across `v2@7d13f08`–`4b137c0`; active uncommitted work observed on 2026-09-03
**Audience:** Agents implementing generation, model integration, content pipelines, quality gates, and tests

> **Moving-tree rule:** use the “Second-pass delta” and final evidence log for current status. Detailed first-pass findings below explain why changes were requested, but some are now closed. Re-run the named command at the commit being reviewed before closing any gate.

## Second-pass delta (authoritative)

The scale bug in `qualityThreshold`, the missing application orchestration, candidate target lengths, template-bank test indirection, construction type errors, content-scan failure, and topology/performance tooling defects from the first pass have been addressed in commits through `7d13f08`. `App.tsx` now exposes a model-gated Construct action and sends successful output through `replacePuzzle`.

The remaining generation risk has moved from **plumbing** to **mathematical objective correctness and editorial evidence**. The companion [mathematical/state-of-the-art review](./GENERATION_ALGORITHMS_STATE_OF_ART.md) is the controlling design document for solver work. Its most important current findings are:

1. **P0 — every real browser construction request currently violates the broker contract.** Each Monday–Saturday recipe unions to 9 target lengths (`3,4,5,6,7,9,10,11,15`); `MAX_TARGET_LENGTHS` is 8. The application fake broker does not enforce this, so tests pass while the real broker rejects before inference.
2. **P0 — on non-theme days, the mandatory model bag has zero effect on fill.** Suggested surfaces are resolved back to ordinary lexicon candidates, the entire lexicon is then added, and the CSP re-sorts by lexicon/learner score plus seed. Model order, confidence, role, associations, and intended sense are discarded. Out-of-lexicon suggestions are discarded. Only theme locks consume suggestions, and those bypass lexicon eligibility.
3. **P0 — the search objective and publish predicate disagree.** The CSP maximizes a sum of (optionally learner-blended) candidate scores; the application evaluates a different normalized score only after search. For a fixed topology, that normalized score is a topology constant plus `0.28/n` times the number of words at or above the `0.45` glue cutoff. The current search can reject its incumbent without directly searching for an assignment that passes the gate.
4. **P1 — all-different deletions break the claimed MAC invariant.** Assigning a word deletes it from all same-length domains, but changed domains are not queued for crossing propagation. Validity remains protected at completion; propagation/MRV information becomes stale and contradictions are delayed.
5. **P1 — bounded search hides termination quality.** If the node limit is hit after an incumbent exists, the API returns `solved` with neither `provenOptimal`, final nodes, bound, gap, nor termination reason.
6. **P1 — personalization is a static rank perturbation and is not supplied by the browser client.** The implementation ignores stored difficulty, always assumes zero filled crossing letters, approximates surprisal from lexicon score, and has no semantic diversity or across-puzzle exposure constraint. `createConstructionClient.run` does not pass a learner profile.
7. **P1 — clue generation remains serial and ungrounded.** One model call is made per answer using synthetic `web2:${word}` sense text. `clueMix` is unused; manifest assembly always prefers a `standard` variant and ignores stored difficulty for primary-clue selection.
8. **P1 — theme locks remain an eligibility exception.** Model-suggested locked words can enter even when absent from the lexicon. That may be a legitimate editorial escape hatch, but it requires a separate source/sense/fact validation contract.
9. **P2 — the required test command is green but not warning-clean.** A transient concurrent Vitest alias failure was removed before the final run. `make test` now passes, but App and harness suites emit React's duplicate-key warning from `ClueColumn`. Make console errors/warnings fail component tests after repairing the key defect.

### Current implementation order

1. Freeze a review commit and make the green required test command warning-clean.
2. Make every day pass through the real broker contract in tests and give validated model semantics an explicit, bounded role in ordinary fill.
3. Repair all-different propagation and add solver termination/optimality telemetry.
4. Replace the post-hoc scalar gate with incremental hard editorial constraints and lexicographic/Pareto objectives.
5. Build a fixed artifact/seed benchmark corpus and ablate DFS against tiered expansion/ILDS, partial-state reuse, and conflict-directed search.
6. Introduce first-class sense/fact records, batched clue ladders, clue-assignment policy, and clue judges.
7. Move from static candidate blending to puzzle-sequence personalization with diversity/exploration constraints and calibrated replay evaluation.

## Outcome we are reviewing for

Crossword generation must be an LLM-enabled, privacy-first product capability rather than a demo generator or an NYT proxy. It must produce structurally valid, enjoyable, personalized puzzles while keeping deterministic mechanics outside the model boundary. A release candidate must be reproducible enough to debug, measurable enough to improve, and safe to ship without importing NYT clues, answers, or puzzle data.

The intended split is:

1. deterministic code owns topology, slot constraints, candidate filtering, fill search, validation, scoring, persistence, and replay;
2. a local/browser model owns semantic expansion, theme ideation, clue writing, clue variants, explanations, and user-sensitive adaptation;
3. tests and quality judges prevent either side from silently producing a technically valid but miserable puzzle.

## Provisional executive finding

The repository now has the right *shape* for a serious generation system: a construction package, topology and lexicon artifacts, CSP work, application-level construction orchestration, adaptive/quality modules, property tests, mutation configuration, and browser journeys. That is substantial progress.

The current tree is not yet a reviewable release unit. A large part of the next generation layer is uncommitted, one earlier feasibility test is deleted, and source/artifact/provenance decisions are mixed with active implementation. The immediate goal should be to turn this work into a coherent vertical slice with explicit contracts and gates—not to add more generation modes.

No claim in this document marked **VERIFY** should be treated as passed until the command or artifact is recorded in the evidence log below.

## Release gates

| Gate | Required evidence | Current state |
|---|---|---|
| G1 Structural validity | Every emitted puzzle passes topology, numbering, crossing, connectivity, answer normalization, and all-different invariants | **VERIFY** |
| G2 Deterministic replay | Seed + recipe + model/config identifiers + artifact hashes reproduce the mechanical build or a diagnosable failure | **VERIFY** |
| G3 LLM-required product path | Normal product generation cannot silently degrade into a non-LLM experience; failure is explicit and recoverable | **VERIFY** |
| G4 Content quality | Automated hard filters plus calibrated judges reject junk fill, duplication, clue leakage, ambiguity, and unfair obscurity | **VERIFY** |
| G5 Personalization safety | Profile signals are local, inspectable, resettable, bounded, and do not collapse into a subject-matter exam | **VERIFY** |
| G6 Provenance | Every shipped lexicon/template/model artifact has a documented origin, license, transform, and hash | **VERIFY** |
| G7 Test trust | Unit, property, integration, E2E, accessibility, visual, and mutation checks have intentional scopes and stable CI commands | **VERIFY** |
| G8 Operational budget | Generation has time/memory/token ceilings, cancellation, progress, and useful failure diagnostics | **VERIFY** |

## First findings and risks

### P1 — Establish one construction use-case contract before extending features

The uncommitted `packages/application/src/constructPuzzle.ts`, `recipes.ts`, and `manifest.ts` appear to be the emerging application boundary. Treat that boundary as the product contract. It should accept an explicit request and dependencies, emit typed progress, support cancellation, and return either a validated puzzle package or a structured failure report. UI code, model runtimes, lexicon loaders, and storage adapters should not leak into the core construction algorithm.

**Agent acceptance criteria**

- One public use case owns the full orchestration path.
- Dependency interfaces cover clock, randomness/seed, model capability, artifact loading, and telemetry without importing browser APIs.
- The result records seed, recipe/version, topology id/hash, lexicon id/hash, model id/config, quality scores, retries, and timings.
- All terminal failures are discriminated and actionable; no `null`, generic `Error`, or silent fallback at the boundary.

### P1 — Make the LLM boundary mandatory but narrow

The product requirement is explicitly LLM-enabled. “Mandatory” should mean that a publishable personalized puzzle requires successful semantic work from a configured local model—not that the model is allowed to solve exact-cover/CSP constraints or return unchecked JSON that becomes a puzzle.

The construction use case should fail clearly when the requested model capability is unavailable. A deterministic fixture path remains appropriate for automated tests and developer diagnostics, but it must be visibly separate from the product path.

**Agent acceptance criteria**

- Capability handshake before generation (runtime, model, context budget, structured-output support).
- Typed model ports for theme/candidate expansion and clue generation; schemas validated at the boundary.
- Every model output is normalized, filtered, and independently validated.
- No remote call is introduced by fallback; privacy mode is testable.
- Retry limits and deterministic repair rules prevent unbounded agent loops.

### P1 — Lock down source provenance before growing the corpus

The working tree includes `extract-nyt-topology.py`, `judge-nyt-templates.mjs`, frequency-prior artifacts, and human-seeding scripts. These may be useful research/build tools, but their names and likely inputs create an avoidable ambiguity around what is derived from NYT material and what may ship.

Do not treat “only a grid shape” as automatically cleared for redistribution. The implementation team should create a machine-readable provenance manifest and keep research-only inputs/output out of the production artifact pipeline until the owner has made an explicit licensing decision.

**Agent acceptance criteria**

- Each artifact records source URI/dataset, license, retrieval date, transform script/version, checksum, and allowed use.
- Production builds consume only allow-listed artifact classes.
- Forbidden-content scanning covers source artifacts and generated fixtures, with narrow reviewed exemptions.
- NYT API continuity remains an isolated local-only legacy adapter and cannot enter a deploy bundle.

### P1 — Define quality as a layered gate, not one score

`quality.ts` and `adaptive.ts` are promising module boundaries. A single weighted score, however, must never allow a beautiful theme to compensate for an invalid crossing or garbage fill. Use hard rejection gates first, then Pareto/weighted ranking among valid candidates.

Minimum hard gates should include normalization, dictionary/provenance eligibility, crossing consistency, connectedness, checked-letter policy, duplicate/root repetition, clue-answer leakage, enumeration agreement, and banned/sensitive content. Ranking can then consider familiarity, freshness, wordplay, theme cohesion, profile fit, clue diversity, and expected solve flow.

### P1 — Reconcile the deleted feasibility test and new property suites

`packages/construction/src/fillFeasibility.test.ts` is deleted while new topology/CSP/quality property tests and a package-specific mutation config are untracked. That may be a valid replacement, but it must be an intentional migration with equivalent or stronger behavioral coverage. Do not merge a test deletion merely because a rewrite changes internal APIs.

**Agent acceptance criteria**

- Map every removed behavior to a surviving test, or restore the missing behavior test against the public contract.
- Property tests print/replay their seed and shrink counterexamples.
- At least one corpus of known adversarial/unsatisfiable cases is versioned.
- Mutation thresholds apply to decision-heavy construction code, with explicit justified exclusions only.

### P2 — Separate correctness, quality, and performance tests

Correctness checks must be deterministic and blocking. Quality evaluation may use stable fixture judges and separately tracked local-model evaluation. Performance needs its own budgets and fixtures so a slow CSP regression does not masquerade as a flaky unit test.

Recommended lanes:

- `test:unit` — domain/application behavior, no browser or model download;
- `test:property` — topology/CSP invariants with replayable seeds;
- `test:integration` — real artifacts plus deterministic fake model;
- `test:eval` — opt-in configured local model, scored corpus, trend report;
- `test:e2e` — browser solve/generate/resume/error journeys;
- `test:mutation` — focused high-value packages on a scheduled or pre-release lane;
- `test:perf` — fixed machine/profile or relative regression budgets.

## Historical source findings (2026-09-03 pass 1)

> This section preserves the first-pass evidence and line references for auditability. Several defects described in the present tense were subsequently closed; do not use these headings as current status. The authoritative status is the second-pass delta and evidence log above/below.

### P0 — The declared quality gate and the enforced threshold are different quantities

`constructPuzzle` passes the recipe's `qualityThreshold` (values `0.55`–`0.68`) into `solveFill` (`packages/application/src/constructPuzzle.ts:139-149`). The CSP compares that number with the **sum of all candidate scores** (`packages/construction/src/csp.ts:464-478`), which grows with dozens of entries. After filling, `scoreFill` calculates the documented normalized `0..1` editorial score (`constructPuzzle.ts:197-205`), but that result is only copied into the manifest and is never compared with the recipe threshold.

The comment in `packages/construction/src/quality.ts:4-8` therefore describes a gate that does not exist. In practice, a 15×15 fill can satisfy a `0.68` threshold almost trivially while its normalized editorial score is below the intended release bar.

**Required correction:** give the CSP bound an explicitly different name/unit (for example `minimumAssignmentScore`) and apply `recipe.qualityThreshold` to `scoreFill(...).score` before clue generation/publication. Add a regression test where the CSP solves but the editorial score fails.

### P1 — Original construction is not wired into the product UI despite the accepted ADR saying it is

`apps/web/src/constructionClient.ts` adapts both workers to `constructPuzzle`, but no production component imports or calls `createConstructionClient`. `App.tsx` starts with the hard-coded `createRealPuzzle()`, offers only the NYT weekday loader (`App.tsx:222-232`), and exposes model install/load without a Construct action (`App.tsx:463-493`). The success notice says construction is “available to the queue,” but no queue exists.

This directly contradicts ADR 0003's accepted “App wiring” statement (`docs/adr/0003-original-construction-lab.md:65-70`). Change the ADR to proposed/partial until an E2E test constructs a puzzle through the real UI and hands it to `replacePuzzle`.

### P1 — The default “real” puzzle demonstrates why structural validity is not editorial quality

`createRealPuzzle()` is structurally valid, but its shipped fill contains entries such as `AANDE`, `DOTO`, `TTAB`, `HADON`, `EPAD`, `ATEA`, `HRAP`, and `SPYS`, alongside exactly the US-brand/politician trivia the product is meant to move away from (`packages/domain/src/puzzle.ts:439-521`). Its manifest nevertheless asserts quality `0.82`, lexicon/provenance/integrity thresholds of `1`, and validators that do not actually run there (`puzzle.ts:634-648`).

Keep this only as an explicitly bad/adversarial fixture, or replace it with a human-reviewed local continuity puzzle. It must not be the opening product experience or a golden quality baseline.

### P1 — Manifest metadata currently overclaims validation and integrity

The domain validator confirms that quality/provenance/integrity fields have the right *shape*; it does not execute the named validators, verify licenses/digests, or recompute integrity (`packages/domain/src/puzzle.ts:175-265`). `assemblePuzzleManifest` initially labels an FNV-1a correlation value as `algorithm: 'sha256'` (`packages/application/src/manifest.ts:98-142`) and returns that value as a valid `PuzzleDocument`; only the higher-level caller upgrades it later.

The construction path also records a seed string as the model “digest” and a prose assertion as the model “license” (`constructPuzzle.ts:178-195`), and does not add a topology provenance record. A caller-provided `modelId` is accepted without tying it to the configured broker manifest.

**Required correction:** make an unfinalized manifest a distinct type that cannot be persisted; verify digests at parse/persistence boundaries; produce provenance from actual adapter/artifact receipts; and make validator evidence structured rather than a list of self-asserted names.

### P1 — Personalization and weekday clue policy are present as types but absent from construction

`adaptiveScore`/`blendScore` are exported and unit-tested but have no production caller. `DayRecipe.clueMix` is defined for every weekday but never read outside recipe definitions. For non-theme-lock days, model candidate suggestions are resolved to the same lexicon candidates that are then loaded wholesale; their meaningful effect is at most tie/order bias. The user's learner profile is reduced to one free-text `audienceSummary` and does not reach scoring.

This is scaffolding, not adaptive generation. Do not claim personalized puzzles until a test proves that controlled changes to a profile change the ranked candidate set while preserving validity, novelty, and a bounded general-interest share.

### P1 — Theme entries bypass the stated lexicon authority and requested lengths can make Thursday fail

The CSP contract explicitly lets `lockedWords` join the eligible set even when absent from the lexicon (`packages/construction/src/csp.ts:24-34`), while the use case says the lexicon is authoritative (`constructPuzzle.ts:101`). That permits unchecked model text into a final puzzle. In addition, candidate generation asks only for lengths 3–10 (`constructPuzzle.ts:86-94`), but theme locking chooses the longest topology slots and accepts up to 15 (`constructPuzzle.ts:250-279`).

Define an explicit, separately validated “editorial theme exception” policy or require lexicon membership. Derive requested target lengths from the chosen template before asking the model, and test every theme-lock recipe against every allowed template.

### P1 — Clue generation is serial, semantically under-grounded, and not calibrated to the recipe

The use case makes one model call per entry in sequence (`constructPuzzle.ts:164-176`), which can mean 70+ serial completions on a 1B browser model. Each call supplies only `answer` and the synthetic sense `web2:${word}`; the actual candidate intended sense, user profile, crossing fairness, locale, recipe clue mix, and neighboring clue diversity are absent. The WebLLM prompt is correspondingly minimal (`packages/model-runtime/src/webllmAdapter.ts:160-167`).

Batch clue drafting, ground each answer in an allow-listed sense/fact record, and validate morphology, leakage, duplicate wording, answer ambiguity, and cultural fit. Select the final ladder against `clueMix` and difficulty targets. Performance evidence must use the real browser model, not the fake adapter's six-second result.

### P2 — Replay is not deterministic at the model or manifest boundary

The seed is placed in prompt text but is not passed as a sampler seed; the adapter defaults to temperature `0.8` (`webllmAdapter.ts:189-203`). `generatedAt` is read from the live clock (`constructPuzzle.ts:216-223`). Record the actual sampler parameters and output receipts, inject clock/randomness, and define replay as either exact output replay from receipts or deterministic mechanical replay from captured model outputs.

### P2 — Data/model delivery claims need to match the deploy graph

The web build does not run `data:sync`; it relies on separately copied files under `apps/web/public/data`, creating a stale-artifact risk. `loadConstructionAssets` says all asset fetches are same-origin, while WebLLM downloads model weights from its configured MLC distribution. Local inference remains privacy-positive, but the network/cache/offline boundary should be stated accurately and tested.

### P1 — The content release gate is currently red

`npm run scan:content` exits 1 because the new `apps/web/e2e/workflow.spec.ts` contains a literal legacy-provider route pattern without an exemption. A negative network test is exactly the right intent, but it still needs a narrow, reviewed scanner exemption or a scanner-safe fixture construction. The scan also traverses generated `dist`, so build/scan order and stale output policy must be deterministic.

### P1 — Current CI only partially exercises the new system

The current uncommitted `Makefile` has improved `make test` to run web plus domain/application/construction/model/persistence tests, and CI invokes that target. CI still omits TypeScript workspace **build/typecheck** scripts, Playwright, mutation, JS/TS coverage, content/data drift, artifact reproducibility, and the production web build. A green root `npm test` is particularly misleading because root Jest explicitly ignores `/apps/` and `/packages/` (`package.json:46-56`). Establish one CI entry point whose required lanes match G1–G8.

### P1 — The deleted fill-feasibility test is not yet behaviorally replaced

The removed `fillFeasibility.test.ts` exercised full-lexicon feasibility for the `double-stack-30` template at seed 7 and a 400k-node budget. The new application happy path exercises only `human-15x15` at 60k nodes. Keep the new vertical test, but restore equivalent template/corpus feasibility coverage as a separately classified integration/performance test.

### P1 — Template-bank invariants are tested against a copied mask, not the bank

The new topology test validates a duplicated `HUMAN_MASK` constant rather than iterating the exported `curatedTemplateBank()`. This allows a template-bank edit to bypass the test while comments continue to claim every bank entry is validated. Assert the invariant on the production export and include template id in failures.

### P1 — The topology tooling is not executable as a quality gate

`scripts/design-topology-bank.mjs:311` pushes an object containing `as`, but no `as` binding exists; the nearby function is named `acrossScore`. This runtime error is outside TypeScript coverage. Separately, `scripts/judge-nyt-templates.mjs` declares `THRESHOLD` but never applies it: survivors are sorted, a report is always written, and the command finishes without a failing exit condition. Neither topology command runs in CI.

Fix the script error, rename research/evaluation commands to make their status explicit, and add a deterministic production-template gate that exits non-zero when fillability, validity, or budget thresholds fail.

### P1 — Unit tests are green while a package typecheck is red

The full workspace test command passed 109 tests, including the new CSP edge/property suites. Immediately afterward, `npm --workspace @crossword/construction run build` failed with three TypeScript errors in the new `csp.edge.test.ts` (unsafe optional `solution` access at lines 29–30 and an invalid `Record<string,string>` table case at line 42). This is exactly why both tests and package builds must be required: Vitest transpilation does not prove test sources typecheck.

### P1 — The new rebus E2E cannot pass against its harness

`apps/web/e2e/rebus.spec.ts` expects a right-click prompt to store `AN` in the rebus cell. `HarnessPage.tsx`, however, passes `onEnterRebus={noop}` and owns no mutable session state. Even after the current fixture syntax error is repaired, the prompt result cannot update the rendered harness. Either exercise a real interactive App fixture or make the harness an intentionally stateful interaction harness; do not make a visual fixture pretend to be both.

### P2 — Mutation testing has a real baseline, but documentation/config have drifted

The current Stryker report covers only `packages/construction/src/csp.ts`: 650 mutants, 445 killed, 32 timed out, 152 survived, and 21 had no coverage (approximately 73.4% detected overall). That clears the 70% break floor but leaves substantial decision risk. The fast-profile documentation still says the now-deleted `fillFeasibility.test.ts` runs in the normal suite, so the reported test model and the repository no longer agree.

Prioritize surviving mutants in request validation, cancellation/budget boundaries, all-different, and threshold logic. Expand mutation scope to manifest/application policy only after the construction typecheck and dry run are clean; do not simply raise concurrency on a laptop already running other agents.

### P2 — The browser model payload is duplicated and lacks a budget gate

The production web build succeeds, but emits roughly 6.0MB for `modelWorker`, another 6.0MB for `llmEngineWorker`, plus the main bundle. These chunks appear lazy, but the duplicated WebLLM payload needs a bundle-analysis check and a documented install/download/cache budget before frontend-only deployment.

## Agent action queue

| Order | Owner | Deliverable | Done when |
|---:|---|---|---|
| 1 | Application agent | Construction use-case contract and failure algebra | One typed public API is covered by orchestration tests |
| 2 | Construction agent | Validator and hard-gate pipeline | Invalid outputs cannot reach clue generation or UI |
| 3 | Data/provenance agent | Artifact manifest and production allow-list | Every bundled artifact has origin/license/hash |
| 4 | Model agent | Local-model ports and capability handshake | Product path proves LLM participation and fails explicitly offline/unavailable |
| 5 | Test agent | Script/CI test matrix and deleted-test reconciliation | Each lane has one stable command and documented scope |
| 6 | Test agent | Mutation baseline for construction/application decisions | Surviving mutants are triaged; threshold reflects baseline, then ratchets |
| 7 | Evaluation agent | Small human-rated golden corpus and rubric | Automated metrics are calibrated against solver ratings |

## Evidence log

| Evidence | Result |
|---|---|
| Snapshot | `HEAD` moved from `3ea7d72` through `7d13f08` to `4b137c0` during this review; dirty-tree inventory recorded 2026-09-03. Results below belong to that moving snapshot, not an immutable release candidate |
| Closed first-pass defects | Threshold units/gate, the old hard-coded `3..10` target-length request, UI construction wiring, template-bank invariant test, construction typecheck, scanner exemption, and perf/tooling gates are present through `7d13f08`. The replacement target-length union exposes the separate broker-limit failure below |
| Real broker/day contract | **FAIL by inspection + executable topology probe**. Every Monday–Saturday recipe yields 9 target lengths; broker permits at most 8. Add a real-broker/fake-adapter integration test for all `constructableDays()` |
| Model influence trace | **FAIL for ordinary days**. Resolving suggestions plus loading the full lexicon produces the same CSP candidates and sorting as loading the lexicon alone; suggestion semantics/confidence/role are not consumed when `themeLocks = 0` |
| `make test` final rerun | **PASS** at `4b137c0` + dirty work: Python 76 passed/3 deselected; legacy Jest 11; web 18; domain 19; persistence 8; application 15; construction 42; model-runtime 19. App/harness tests still emit duplicate-key warnings from `ClueColumn` |
| Application test cost | The three end-to-end construction tests consumed ~21.5 s of the ~28 s required test run; classify/optimize fixtures before multiplying this matrix |
| Production web build | **PASS**, 68 modules. Build emits both an approximately 6.03 MB `llmEngineWorker` chunk and an approximately 6.04 MB main `index` chunk, plus a 276 KB UI chunk; investigate WebLLM duplication/lazy-boundary correctness |
| Content scan | **PASS**, 130 files, 0 violations, 6 reviewed exemptions (including built output and the legacy continuity adapter/tests) |
| Fill performance gate | **PASS**: `human-15x15` 8.158 s/159 nodes; `monday-00805` 2.062 s/5,896 nodes; `monday-01254` 2.474 s/2,468 nodes. These are three fixtures on one machine, not a statistically useful performance baseline |
| Mutation report | Report timestamp 2026-09-03 17:19. `csp.ts`: 656 mutants = 455 killed, 29 timeout, 152 survived, 20 no coverage. Detected/all = 73.78%; detected/covered = 76.10%. The 70% break floor passes while many propagation, validation, bound, and result-contract mutations survive |
| Primary-source algorithm review | Complete for the current decision set; see `GENERATION_ALGORITHMS_STATE_OF_ART.md` for the 1990–2025 comparison and implementation priorities |
| Browser E2E / real WebGPU model | Not run in this pass; real-model quality/latency remains unevidenced |
| Production artifact provenance and reproducibility | Not proved in this pass |

## Instructions to implementing agents

- Preserve deterministic seeds and failure artifacts; a failed construction attempt is valuable test data.
- Prefer ports and pure policy functions in domain/application packages; put browser, WebLLM, filesystem, and worker details in adapters.
- Do not loosen validators to make a fixture pass.
- Do not commit generated corpora without provenance metadata and a reproducible build command.
- Update this document's evidence log when closing an item; link the exact test, ADR, or benchmark rather than writing “done.”

## Current implementation checkpoint — 2026-09-05

The earlier moving-tree findings have been reconciled with the current plan
slice. Candidate requests are paged to the real broker's maximum target-length
contract; model suggestions influence ordinary-day ranking only after lexicon
resolution; poor-entry limits are enforced during CSP search; and fill
termination/bound/incumbent telemetry is carried into the published generation
manifest.

The verification baseline is now:

- `make test` — PASS;
- `npm run web:build` — PASS;
- `npm run scan:content` — PASS;
- `npm run e2e:ci` — PASS (39 Chromium journeys);
- construction mutation gate — PASS at the configured 70% floor.

The remaining generation decisions are deliberately not disguised as code
completion: the legal multi-topology benchmark corpus, repeated-seed A/B/C/D
Rust evidence, real-model quality/latency, and blinded human clue/day ratings
still require their own artifacts before any day-graduation or Wasm-promotion
claim.
