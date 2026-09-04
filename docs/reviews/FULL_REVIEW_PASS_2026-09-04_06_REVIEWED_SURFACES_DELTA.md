# Full review increment 06: previously reviewed surfaces delta

Date: 2026-09-04

Priority: sixth because these areas already have substantial direct review

Reasoning tier: strong model for integration; Luna for bounded regression and polish

## Outcome

Solver parity, voice, UI/design, and construction have the deepest existing review record. This pass found no reason to discard those documents or restart their analyses. The efficient next move is to treat them as regression and execution queues while higher-risk orchestration and durability contracts settle.

## Solver and domain state

The recent solver work materially improved domain ownership:

- evaluation receipts and scoring live in domain state;
- entry solve state is no longer purely a view concern;
- paste, direction, checking, completion, and reload journeys have more direct coverage;
- the full QA gate passed at the prior implementation checkpoint.

The earlier post-change review remains valuable history, but some of its open implementation observations are now stale. Reproduce a finding against the current tree before assigning another repair.

Next actions are regression-oriented:

- keep verified-empty versus untouched-empty behavior in domain tests;
- preserve rebus/circle/shade mechanics through serialization;
- add property coverage for score/event monotonicity where it adds value;
- keep browser journeys for paste, crossing direction, reveal/check, reload, and completion.

Model allocation: Luna is appropriate for explicit regression cases. Use a stronger model only if a change alters the domain state machine or persisted schema.

## Voice state

`VOICE_MODE_REVIEW_2026-09-04.md` is already a 747-line product and architecture review, and the web suite now contains broad speech/voice unit coverage. Do not commission a third conceptual review before implementing its remaining gates.

Highest-value remaining work:

- exact spelling and homophone behavior under crossword context;
- contextual preview/commit UX;
- cancellation and worker readiness under real timing;
- real microphone/browser/device testing;
- privacy verification that no audio or transcript survives beyond the declared lifecycle.

Model allocation: use a strong model for parser ambiguity or async state ownership. Luna is suitable for fixture matrices, accessibility assertions, copy, and hardware-run documentation after expected behavior is fixed.

## UI, interaction, and accessibility state

The repository already contains a UI review and two substantial design-language plans. Most remaining UI work is implementation and verification, not missing art direction.

Current risks to retain in the queue:

- modal focus trapping, initial focus, Escape behavior, and focus return;
- one coherent live-region strategy for model, construction, voice, and completion events;
- reduced-motion behavior for all newly added transitions;
- non-color state cues and high-contrast validation;
- layout at keyboard-open mobile viewport sizes;
- stable visual baselines on a named environment.

Visual tests are excluded from the ordinary CI E2E command, and current snapshots are Darwin-specific. Create a deliberate baseline lane rather than assuming normal CI detects visual drift.

Model allocation: Luna can implement CSS, fixed ARIA behavior, screenshot fixtures, and viewport matrices. Escalate when a change depends on an unresolved runtime or product state.

## App integration architecture

`apps/web/src/App.tsx` is approximately 1,100 lines and currently coordinates session hydration, persistence, construction, model setup, voice, notices, dialogs, and puzzle selection. It is the largest merge-conflict surface in the project.

This is not permission for a speculative component rewrite. The App should consume the state contracts established by runtime, persistence, and personalization work, then extract cohesive orchestration only where tests identify a stable seam.

Required integration rules:

- exactly one implementation agent owns `App.tsx` during a wave;
- lower-layer agents expose typed ports and tests without editing the App;
- the integrator does not redesign lower-layer state machines at call sites;
- settings, voice, and construction present the same operation identity and terminal states;
- hydration completes before editing is enabled;
- destructive actions share a consistent confirmation/preview contract.

Model allocation: use a strong implementation model for the integration wave because it must reconcile multiple settled contracts. Luna can follow with component extraction only when tests lock behavior.

## Real-browser and hardware evidence

Model E2E currently relies on a fake worker. That is useful deterministic coverage but cannot prove WebGPU initialization, CacheStorage persistence, nested-worker teardown, quota behavior, or actual model download progress. Voice tests likewise cannot substitute for a small hardware/browser matrix.

Create opt-in, non-secret smoke journeys for:

- supported Chromium with WebGPU available;
- WebGPU unavailable;
- insufficient or unknown storage estimate;
- first download, warm load, unload, reload, and cache deletion;
- cancellation during download and engine creation;
- one real microphone permission grant/deny/revoke cycle.

Record device, browser, model revision, bytes, duration, peak memory where observable, and final resource state. Do not make live hardware tests a hidden prerequisite for ordinary contributors; make them an explicit promotion gate.

## CSS maintenance

`apps/web/src/legacy.css` is roughly 37 KB and continues to accumulate behavior. Defer broad reorganization until runtime and modal behavior are stable. Then split by product region or cascade layer with visual and interaction baselines held constant.

Luna-safe sequence:

1. inventory selectors and identify dead rules with browser evidence;
2. add cascade layers or region files without changing specificity outcomes;
3. compare all harness screenshots and interaction tests;
4. delete dead rules only after usage proof;
5. keep one small commit per region.

## Ordered Luna queue

Run this queue only after increments 01 and 02 define their contracts:

1. request-scoped UI fixture and accessibility assertions;
2. model-dialog focus trap, focus return, and reduced-motion checks;
3. service-worker cache-ownership and update-notice browser fixtures;
4. solver regression matrix refresh against current domain state;
5. voice homophone/spelling fixtures and permission-state documentation;
6. stable visual-baseline lane and mobile viewport matrix;
7. mechanical CSS segmentation with no intended visual change;
8. benchmark and promotion-report formatting.

## Verification gate

```sh
npm run test --workspace @crossword/web
npm run web:build
npm run web:e2e
make qa
```

Run the visual baseline lane and opt-in hardware smoke separately when their prerequisites are available, and attach their receipts to release evidence.

## Closure evidence

Open.
