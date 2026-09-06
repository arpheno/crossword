# Full review pass: index and execution order

Date: 2026-09-04

Scope: current `v2` implementation at `ea5a218`, including uncommitted work visible during the review

Purpose: a set of independent handoffs for implementation agents, ordered by neglected risk rather than by UI visibility

## How the order was chosen

The previous review corpus is strongest around construction, solver parity, voice, and visual interaction. It is weakest around cross-worker lifecycle ownership, service-worker cache ownership, persistence concurrency, release boundaries, and the unfinished learner-profile contract.

The ordering below combines two factors:

1. attention gap: how little direct review and test coverage the area has received;
2. reasoning risk: how costly it would be for an implementation agent to guess the wrong state or product contract.

This is not a severity-only list. A well-reviewed P0 can appear later than a newly discovered P0 whose underlying contract has never been specified.

## Ordered review increments

| Order | Increment | Prior attention | Reasoning tier | First owner |
| --- | --- | --- | --- | --- |
| 1 | [Runtime orchestration](FULL_REVIEW_PASS_2026-09-04_01_RUNTIME_ORCHESTRATION.md) | Very low | Superintelligence | Model-runtime architect |
| 2 | [Persistence and offline durability](FULL_REVIEW_PASS_2026-09-04_02_PERSISTENCE_OFFLINE.md) | Very low | Superintelligence | Persistence/PWA architect |
| 3 | [Release, security, and content boundary](FULL_REVIEW_PASS_2026-09-04_03_RELEASE_SECURITY_CONTENT.md) | Low | Strong, with owner decisions | Release/security owner |
| 4 | [Personalization and provenance](FULL_REVIEW_PASS_2026-09-04_04_PERSONALIZATION_PROVENANCE.md) | Low | Superintelligence | Product/data-contract architect |
| 5 | [Construction intelligence delta](FULL_REVIEW_PASS_2026-09-04_05_CONSTRUCTION_INTELLIGENCE.md) | High | Superintelligence | Construction/editorial architect |
| 6 | [Previously reviewed surfaces delta](FULL_REVIEW_PASS_2026-09-04_06_REVIEWED_SURFACES_DELTA.md) | High | Strong/Luna | Area maintainers |

The executable wave plan and copy/paste prompts are in [Full-review remediation handoff](../plans/11_FULL_REVIEW_REMEDIATION_HANDOFF.md).

## Highest-priority findings

- **RTO-P0-1:** model progress can leave the shared controller permanently reporting `generating` after a successful request.
- **RTO-P0-2:** the browser client discards progress `requestId`, so construction, speech, installation, and cache work cannot own their status.
- **PO-P0-1:** service-worker activation deletes every cache except its shell cache, including caches owned by speech and likely WebLLM.
- **PO-P0-2:** the current shell cache does not include hashed application or worker assets, so a successful first visit does not establish the claimed offline boot path.
- **PO-P0-3:** asynchronous hydration can overwrite edits made before IndexedDB loading completes.
- **RS-P0-1:** the deployable graph still includes the local legacy puzzle bridge; source and built output are explicitly exempted from the content scanner.

Do not begin with modal polish. The UI cannot communicate model state honestly until request ownership and terminal state are defined, and it cannot promise offline construction until cache ownership and asset readiness are defined.

## Model allocation

Use a high-reasoning model for:

- the model lifecycle state machine and concurrent request contract;
- hydration, multi-tab, write-order, and archive merge/replace semantics;
- the learner-profile/event/privacy contract;
- editorial objectives, clue grounding, and human-quality evaluation;
- any decision that changes a persisted or public protocol.

Use a strong general implementation model after those contracts settle for:

- protocol and repository implementation;
- release artifact isolation, headers, and CI gates;
- the single integration pass through `App.tsx`;
- compatibility migrations and error presentation.

Use Luna-class agents for bounded mechanical work:

- fixtures, spies, test matrices, accessibility assertions, and benchmark runners;
- CSS and copy changes against a fixed state table;
- build-manifest wiring after cache ownership is defined;
- documentation and mechanical call-site migrations.

A Luna-class agent must stop and report, rather than improvise, when it encounters ambiguous state transitions, destructive data semantics, privacy policy, editorial scoring, or protocol versioning.

## Evidence behind the ordering

Approximate topic mentions across the existing review documents showed heavy attention to models, construction, generation, UI, voice, and solver behavior. Exact phrases for `service worker`, `worker protocol`, and concurrency were nearly absent. The current test suite follows the same shape: construction and voice have broad direct coverage, while service-worker behavior has no dedicated test and model lifecycle tests exercise only a small part of real orchestration.

Large files are not automatically the hardest files. `apps/web/src/App.tsx` is the largest integration conflict surface, but the most reasoning-intensive work is the contract below it in `packages/model-runtime`, `packages/persistence`, and construction evaluation. Keep those responsibilities separate.

## Review rules

- Findings describe the current tree, including work not yet committed at review time. Re-check line numbers after concurrent edits.
- Add closure evidence to each review file; do not delete the original finding.
- Every closure entry names the commit and exact verification command.
- One agent owns `apps/web/src/App.tsx` during the integration wave.
- Never assign the worker protocol and its browser orchestration to independent agents without an agreed versioned contract.
- Owner decisions listed in the release and personalization increments cannot be guessed by an implementation agent.

## Baseline verification observed

Before writing these increments:

- `make install-hooks` completed;
- `make doctor` passed;
- the earlier implementation checkpoint reported the full repository QA gate passing.

The final documentation checkpoint should run `make qa` again. These observations are not closure evidence for any finding above.
