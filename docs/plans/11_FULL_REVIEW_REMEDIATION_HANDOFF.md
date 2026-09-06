# Full-review remediation handoff

Status: implementation runbook based on the 2026-09-04 full review pass.

Purpose: let multiple agents execute safely in increments without asking a cheap model to rediscover architecture, ownership, or acceptance criteria.

## Read before assigning work

Every agent reads, in order:

1. repository `AGENTS.md`;
2. [review ordering index](../reviews/FULL_REVIEW_PASS_2026-09-04_00_INDEX.md);
3. the one review increment assigned to it;
4. the existing plan or review directly linked by that increment;
5. the current `git status --short` before editing.

The repository may contain concurrent uncommitted work. Agents preserve it, do not normalize unrelated files, do not update the lockfile unless assigned, and commit only their owned paths.

## Non-negotiable execution protocol

Paste this block at the top of every implementation-agent prompt:

```text
You are implementing one bounded slice in /Users/arphen/projectc/crossword.
Read AGENTS.md completely. Run make install-hooks and make doctor before editing.
Inspect git status; the worktree may be dirty and other changes belong to other people.
Do not revert, reformat, stage, or commit paths outside your ownership list.
Use tests to reproduce each assigned finding before production changes.
Keep commits at 12 or fewer owned paths and use git commit --only with explicit paths.
Do not use --no-verify. Do not weaken tests or policy gates.
Append closure evidence to the assigned review only after the acceptance criteria pass.
If you encounter an unstated state transition, destructive-data policy, privacy rule,
editorial metric, public schema change, or owner-reserved decision, stop and report
DECISION REQUIRED with options and evidence. Do not guess.
```

## Dependency map

```text
Runtime contract ───────────────┐
                               ├─> single App/settings integrator ─> Luna UI/E2E hardening
Persistence contract ──────────┤
PWA cache/release boundary ────┘

Personalization ADR -> typed profile repository -> construction consumption -> App profile UI

Construction score/eval contract -> construction implementation -> benchmark/promotion evidence
```

The runtime, persistence, PWA/release, and construction-contract work can use separate agents because their ownership does not overlap. App integration waits until their public contracts settle.

## Increment 1A: runtime state contract and red tests

Model: highest available reasoning.

Owned paths:

- `packages/model-runtime/src/workerProtocol.ts` and its test;
- `packages/model-runtime/src/broker.ts` and direct state-machine tests;
- a new ADR or state-table document if needed.

Do not edit:

- `apps/web/src/App.tsx`;
- settings components or CSS;
- persistence or construction packages.

Copy/paste assignment:

```text
Implement only the contract/red-test half of FULL_REVIEW_PASS_2026-09-04_01_RUNTIME_ORCHESTRATION.md.
Own the model-runtime protocol and broker paths listed in the handoff. First write a complete
transition table covering cached/not-cached, resident/not-resident/unknown, queued/running
operation, success, cancellation, failure, and fatal worker loss. Preserve requestId and define
operation owner/kind/terminal status. Decide from the actual WebLLM adapter behavior whether
prepare is atomic or download and load are genuinely separable; explain the choice in an ADR.
Add red tests for reordered progress, two consumers, overlapping prepare, cancellation at each
awaited boundary, unload failure, and delete during generation. Do not touch App.tsx or UI.
Stop after the contract, tests, and ADR are reviewable; do not make broad implementation changes
in the same commit. Report exact failing tests as the handoff to Increment 1B.
```

Exit gate:

- transition table has no unnamed state;
- every terminal path is represented;
- red tests fail for the intended current behavior, not due to type/build mistakes;
- protocol versioning/backward compatibility is explicit.

## Increment 1B: runtime implementation

Model: strong or highest reasoning; preferably the same owner as 1A.

Owned paths:

- `packages/model-runtime/src/broker.ts`;
- `packages/model-runtime/src/webllmAdapter.ts`;
- `packages/model-runtime/src/workerProtocol.ts`;
- `apps/web/src/workers/modelWorker.ts`;
- `apps/web/src/workers/modelClient.ts`;
- direct tests for those files.

Copy/paste assignment:

```text
Implement the approved runtime transition table from Increment 1A. Make the worker the single
command arbiter, preserve operation identity through the browser client, and make adapter resource
ownership honest. Teardown must unload and terminate the nested worker idempotently. Fatal worker
failure must permit a fresh client/worker on retry. Cooperative cancellation gets a bounded hard
fallback. All command failures follow the approved typed-result or throwing convention uniformly.
Make the red tests green and add a two-owner reordered-event test. Do not edit App.tsx,
localModelController.ts, persistence, CSS, or construction. If the WebLLM API cannot support the
approved cache/residency distinction, stop with evidence rather than simulating a false state.
```

Exit gate:

- one engine is created under overlapping prepare calls;
- stale events cannot mutate a successor operation;
- repeated prepare/unload does not leak workers;
- model-runtime and web worker-client suites pass;
- review increment 01 contains a closure entry for the owned findings.

## Increment 2A: storage semantics and persistence red tests

Model: highest available reasoning.

Owned paths:

- `packages/persistence/src/**`;
- persistence ADR/state-table docs;
- package-local tests.

Do not edit `App.tsx`, `sw.js`, or UI.

Copy/paste assignment:

```text
Implement the contract/red-test half of FULL_REVIEW_PASS_2026-09-04_02_PERSISTENCE_OFFLINE.md.
Define boot hydration, monotonic write ordering, single-writer versus conflict-detecting multi-tab
behavior, schema migration, full-replace, merge, and single-puzzle import semantics. Treat these as
different named operations. Centralize database open/version ownership and handle blocked and
versionchange. Add controlled-deferred tests proving an old write cannot beat a new revision and a
failed import changes nothing. Add graph-wide archive validation fixtures. Do not change App.tsx or
service-worker code. If product policy must choose between a read-only secondary tab and conflict
UI, stop with options before implementing either.
```

Exit gate:

- a reviewed persistence state table/ADR exists;
- red tests cover delayed hydration inputs, reversed writes, two tabs, blocked migration, invalid graph, and atomic import;
- existing archive fixtures remain valid or have an explicit versioned migration.

## Increment 2B: persistence implementation

Model: strong, following the approved contract.

Owned paths:

- `packages/persistence/src/**`;
- package-local tests.

Copy/paste assignment:

```text
Make the approved Increment 2A tests green without editing App.tsx. Create one database/version
owner, serialize revisioned writes, enforce the chosen writer/conflict policy, validate archive
referential integrity before transactions, and implement separately named merge/replace/import-one
operations. Preserve old data through tested migrations. Return typed results suitable for a later
UI preview. Do not add UI assumptions or silently choose defaults that were not in the ADR.
```

Exit gate:

- persistence package tests pass;
- migration tests cover every supported prior version;
- atomicity and newest-revision tests use deliberately reordered asynchronous completion;
- public API is documented for the App integrator.

## Increment 2C: PWA cache ownership and offline artifact

Model: strong; Luna is acceptable only after the cache-ownership table is supplied.

Owned paths:

- `apps/web/public/sw.js`;
- service-worker registration module extracted from `main.tsx` if useful;
- Vite/build-manifest configuration;
- dedicated service-worker and offline tests.

Do not edit `App.tsx`, runtime internals, or speech/model cache implementations beyond importing agreed cache names.

Copy/paste assignment:

```text
Implement PO-P0-1 and PO-P0-2 from FULL_REVIEW_PASS_2026-09-04_02_PERSISTENCE_OFFLINE.md.
Start with a cache-ownership table. Add a red activation test seeded with old/current shell,
speech, WebLLM, and foreign caches. Activation may delete only obsolete Crossword shell caches.
Generate a precache manifest from the exact build so hashed JS, CSS, worker chunks, and required
boot assets work after one successful visit. Do not return index.html for missing modules, workers,
or data assets. Add cold-first-install and old-to-new upgrade browser journeys. Preserve explicit
model/speech deletion under their owning settings paths. Do not claim construction-offline
readiness unless its worker and lexicons are part of a separately verified receipt.
```

Exit gate:

- foreign/model/speech caches survive activation;
- one-visit offline reopen works;
- old-to-new upgrade works without mixed artifact chunks;
- test output names the exact artifact/cache versions.

## Increment 3: release boundary and promotion evidence

Model: strong, with owner decisions supplied.

Owned paths:

- release-specific web entry/configuration;
- `scripts/scan-forbidden-content.mjs` and policy/fixtures;
- `.github/workflows/ci.yml` or a promotion workflow;
- deployment header configuration;
- release/provenance documentation.

Avoid editing `App.tsx`; coordinate if release graph isolation requires a small call-site change.

Copy/paste assignment:

```text
Implement FULL_REVIEW_PASS_2026-09-04_03_RELEASE_SECURITY_CONTENT.md as an exact-artifact gate.
Separate the local legacy bridge from the release import graph. The built public artifact gets no
legacy-route exemption. Scan every emitted asset once, validate content/provenance/license receipts,
add deployment security headers, generate an SBOM, and align CI with the branch/promotion policy.
Add seeded negative tests for every forbidden policy class. Record but do not decide the project
license, production lexicon, deployment target, model redistribution, or day-graduation threshold.
If any is still undecided, complete reversible tooling and report the release gate blocked on the
named owner decision.
```

Exit gate:

- freshly built public artifact has zero forbidden exemptions;
- local development bridge still works only through its non-release path;
- effective headers and network trace match the allowlist;
- SBOM and source/model receipts identify the immutable artifact.

## Increment 4: personalization contract

Model: highest available reasoning. This first assignment is deliberately documentation and pure-reference work.

Owned paths:

- a new personalization ADR;
- versioned domain event/profile schema modules and pure tests, if the ADR is approved;
- synthetic evaluation fixtures outside App and persistence integration.

Copy/paste assignment:

```text
Resolve the contract questions in FULL_REVIEW_PASS_2026-09-04_04_PERSONALIZATION_PROVENANCE.md.
Define the smallest honest local profile, consent/default, source events, retention, confidence,
inspect/edit/reset behavior, export behavior, and a strict no-audio/no-transcript rule. For every
profile field provide its source event, pure update rule, uncertainty behavior, and user-facing
explanation. Remove any field whose inference cannot be justified. Create versioned strict schemas,
pure reducers, and synthetic ablation fixtures only after the ADR is approved. Do not build settings
UI and do not infer psychological state from latency. Stop on consent/default decisions requiring
the owner.
```

Exit gate:

- every field is explainable and deletable;
- neutral/no-profile behavior is complete;
- event coverage is sufficient for each enabled reducer;
- ablations demonstrate bounded effects;
- no UI claims personalization yet.

## Increment 5: construction intelligence contract and benchmark

Model: highest available reasoning.

Owned paths:

- construction/application scorecard and receipt types;
- benchmark/evaluation fixtures and runners;
- direct tests;
- avoid `App.tsx` and web UI.

Copy/paste assignment:

```text
Implement the measurement-first portion of FULL_REVIEW_PASS_2026-09-04_05_CONSTRUCTION_INTELLIGENCE.md.
Do not rewrite the CSP or reopen repaired all-different/topology work. Version the existing scorecard,
carry termination/bound/gap telemetry into construction receipts, and freeze a provenance-clean
multi-topology benchmark. Design hard gates separately from fill quality, clueability, freshness,
theme coherence, and learner fit. Add pairwise fixtures and term ablations. Remove or calibrate
self-reported model confidence. Specify deterministic clue leakage/duplication/sense validators and
bounded clue checkpoint/retry behavior. Treat theme placement as a global set/placement decision.
Stop before choosing editorial weights or graduation thresholds without blinded-human evidence.
```

Exit gate:

- benchmark reports distributions rather than one success;
- receipts include actual runtime and solver evidence;
- score terms have interpretable ranges and ablations;
- human-evaluation inputs are blinded and provenance-clean;
- repaired CSP properties remain green.

## Increment 6: single App and settings integration

Model: strong general implementation model.

Start only after runtime and persistence public APIs are settled. One agent owns all App changes in this wave.

Owned paths:

- `apps/web/src/App.tsx` and its tests;
- `apps/web/src/localModelController.ts` and tests;
- `apps/web/src/constructionClient.ts` and tests;
- directly related settings/modal components;
- no lower-layer protocol redesign.

Copy/paste assignment:

```text
Integrate the settled runtime, persistence, PWA-update, and profile contracts into App and settings.
Do not redesign those contracts at call sites. Gate editing until hydration establishes the
authoritative session. Present model state by operation identity: downloading with measured/estimated
progress, loading, ready, generating for a named consumer, unloading, deleting, cancelled, and failed.
Ensure stale operation events cannot overwrite current UI. Distinguish model-ready from complete
offline-construction readiness. Add update-ready UI that flushes durable writes before refresh.
Give continuity import a counts/version preview and explicit merge/replace semantics. Make constructed
puzzles durable and reopenable. Implement modal focus trap, initial focus, Escape, return focus,
one live-region strategy, and reduced motion. Keep changes behavior-first and avoid broad CSS cleanup.
```

Required browser journeys:

- slow first download with progress, cancel, retry, completion, and settings reopen;
- construction generation while settings remains truthful;
- unload and cache delete with confirmation and terminal result;
- delayed hydration with attempted early input;
- publish, reload, and reopen a constructed puzzle;
- update available with pending save;
- archive preview, cancel, merge, and replace failure;
- keyboard-only modal lifecycle and screen-reader announcements.

Exit gate:

- unit, build, and E2E pass;
- no two UI components synthesize incompatible model phases;
- focus and live-region assertions are deterministic;
- no App call site bypasses a lower-layer typed result.

## Increment 7: Luna hardening queue

Model: Luna-class agent, one small slice per task.

Give Luna only one numbered item at a time:

1. add request-owner/reordered-event UI fixtures against the fixed runtime API;
2. add cache-activation and service-worker-update browser fixtures;
3. expand archive migration/conflict fixtures against fixed semantics;
4. refresh solver parity regression cases against the current domain model;
5. add voice spelling/homophone/permission fixtures with fixed expected outcomes;
6. establish a named visual-baseline environment and mobile viewport matrix;
7. segment `legacy.css` mechanically with no intended visual change;
8. format benchmark and promotion reports from fixed schemas.

Copy/paste assignment template:

```text
Take only Luna hardening item N from docs/plans/11_FULL_REVIEW_REMEDIATION_HANDOFF.md.
The behavior contract is fixed by [name the ADR/test]. Own only [explicit paths]. Add or improve
tests/fixtures first, then make the smallest mechanical implementation change needed. Do not alter
state transitions, persisted schemas, privacy behavior, editorial weights, release policy, or public
protocols. If the fixed contract is insufficient, stop with DECISION REQUIRED instead of extending it.
Run the listed package gate and make qa, commit only owned paths, and report exact evidence.
```

## Merge and coordination rules

- Use separate worktrees or strictly disjoint file ownership for concurrent agents.
- Runtime and PWA agents coordinate cache names through a tiny stable constants contract; neither deletes the other's cache.
- Persistence and personalization agents coordinate schema versioning before profile storage lands.
- Construction does not consume profile fields until the personalization ADR and reducer tests are approved.
- Only the integration agent edits `App.tsx` in its wave.
- Rebase or merge completed lower-layer commits before App integration; do not copy patches by hand.
- Resolve semantic conflicts by returning to the ADR/transition table, not by choosing the version that compiles.

## Per-increment completion report

Require every agent to return this exact structure:

```text
Outcome:
Owned commits:
Owned files changed:
Finding IDs closed:
Finding IDs still open:
Decisions made from an approved contract:
DECISION REQUIRED items:
Tests added first:
Verification commands and results:
Manual/browser evidence:
Unrelated dirty files left untouched:
Recommended next increment:
```

An increment is not complete because it produced code. It is complete when its acceptance criteria, tests, resource/data cleanup, and closure evidence agree.
