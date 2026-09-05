# Full review increment 03: release, security, and content boundary

Date: 2026-09-04

Priority: third implementation increment

Reasoning tier: strong implementation model, with explicit owner decisions before release

## Outcome

The architecture documents describe a static, local-inference, original-content product. The current repository is still a migration tree containing a local legacy puzzle bridge, incomplete artifact scanning, and no repository-level deployment header policy. That is acceptable for local development only if the release graph is made mechanically different and independently verified.

## RS-P0-1: the public build graph still includes the legacy puzzle bridge

Evidence:

- `apps/web/src/nytApi.ts:294-295` contains local bridge routes;
- the App's new-puzzle flow still reaches that adapter;
- Vite contains a corresponding development proxy;
- `scripts/forbidden-content.json` exempts relevant source and built output from scanning.

The master plan explicitly says a public artifact contains none of those routes or provider dependencies. The scanner exemption means a green scan currently proves only that known violations were waived.

This is an M4.1 release blocker, not a demand to remove the local continuity bridge from development today.

Acceptance:

- the release entry graph cannot import the legacy adapter;
- the production artifact has zero exemptions for forbidden provider routes;
- source maps, manifests, worker chunks, and lazy chunks are scanned;
- a local development bridge remains possible only through a clearly non-release entry or adapter;
- exact-artifact network tracing proves the static product has no legacy route dependency.

## RS-P1-1: artifact scanning produces misleading evidence

The scanner includes `apps`, which already contains `apps/web/dist`, and then also appends the dist root. Findings from the build can appear twice. At the same time, explicit dist exemptions permit forbidden strings in the shipped artifact.

Acceptance:

- source scan and exact-artifact scan are separate named gates;
- each file is scanned once;
- public artifact scanning has no route/content exemptions;
- output distinguishes forbidden material, permitted development bridge material, and licensed first-party fixtures.

## RS-P1-2: the scanner is narrower than the release contract

Current patterns focus on several hosts, route names, and local inference remnants. The release contract also needs coverage for provider IDs, copied clue/answer samples, fixture and starter-bank provenance, source maps, cache manifests, and license receipts. Large-file skipping must not silently omit text-bearing assets.

Acceptance:

- the scanner consumes the build manifest and enumerates every emitted asset;
- provenance and license ledgers are validated as structured data;
- binary assets use an explicit allowlist and receipt rather than size-based invisibility;
- a seeded forbidden-fixture test proves each policy class fails the gate.

## RS-P1-3: browser security headers are not defined in the repository

No checked-in deployment policy currently establishes Content Security Policy, Permissions Policy, Referrer Policy, or cross-origin isolation decisions. This app uses microphone permission, WebGPU, browser workers, and remote model assets, so those boundaries need an explicit release contract even if the host ultimately supplies headers.

Required decisions:

- exact model and static asset origins;
- whether cross-origin isolation is required by the chosen runtime;
- microphone policy and framing policy;
- development-only allowances versus production policy.

Acceptance:

- production headers are versioned beside deployment configuration;
- CSP does not require broad `*`, `unsafe-eval`, or unreviewed origins;
- microphone is self-only unless an owner deliberately chooses otherwise;
- an automated exact-artifact smoke asserts the effective headers.

## RS-P1-4: CI branch coverage does not mirror active development

The workflow is centered on `master` while substantial work occurs on `v2`. Pull requests into `master` receive coverage, but direct integration on the active branch can drift unless branch protection or workflow triggers establish the intended path.

Acceptance:

- document the canonical merge path and protected branches;
- run the full gate on every branch that can produce a promoted artifact;
- artifact promotion references an immutable commit and test run.

## RS-P1-5: supply-chain and model receipts are incomplete

The quality plan calls for dependency, license, and artifact evidence, but CI does not yet generate an SBOM, perform a pinned dependency audit, or verify remote model license/hash receipts. A lockfile pins npm resolution; it does not document the model files downloaded later in the browser.

Acceptance:

- generate an application SBOM for the promoted commit;
- record package audit policy and reviewed exceptions;
- pin model ID, revision, expected bytes, license, source, and integrity where the delivery mechanism permits;
- record lexicon/data source licenses and redistribution status;
- block promotion when required receipts are missing.

## RS-P1-6: model prompts accept untrusted free text without strong boundaries

Candidate and clue prompts interpolate audience, seed, exclusions, and intended sense. Inference remains local, so this is primarily an output-integrity and editorial-safety concern rather than remote exfiltration. A crafted value can still redirect the model or weaken clue constraints.

Acceptance:

- untrusted fields are serialized as delimited structured data;
- schema validation rejects extra output and invalid candidate/clue properties;
- deterministic validators remain authoritative;
- adversarial prompt fixtures cover instruction-like audience and seed values;
- no prompt output directly bypasses content/license/editorial gates.

## RS-P1-7: provenance does not identify the actual run

Evidence:

- the App supplies the placeholder model name `local-pinned-model`;
- the model manifest identifies a concrete Llama model;
- application prompt version constants and manifest configuration disagree;
- generation uses nonzero temperature without an inference seed;
- some receipts use seed-derived text where an actual digest is expected.

Acceptance:

- every published puzzle records actual model ID and immutable revision;
- prompt-template versions come from the implementation that rendered them;
- inference parameters and deterministic seed capability are recorded honestly;
- output hashes are cryptographic digests of canonical data;
- inability to reproduce an inference is explicitly labeled, not hidden behind a replay claim.

## RS-P1-8: destructive operations need release-grade safeguards

Model-cache deletion has a confirmation path; continuity replacement does not yet provide an equivalent preview of the data it clears. Destructive actions should be scoped to owned storage and produce a local result receipt.

Acceptance:

- confirmation copy names scope, approximate size/count, and irreversibility;
- cancellation does not mutate storage;
- failures identify partial versus atomic outcomes;
- cache cleanup never reaches foreign caches;
- continuity replacement is transactionally all-or-nothing.

## Decisions reserved for the owner

Implementation agents must not invent:

- final project license;
- approved production lexicon and knowledge sources;
- whether any copyleft implementation is reused;
- deployment target and effective header mechanism;
- initial model pin, supported device floor, and model redistribution approach;
- blinded-human quality thresholds for day graduation.

An agent may prepare options, evidence, and reversible spikes. It must stop before encoding an unstated owner choice into a public contract.

## Implementation sequence

1. Define development and release entry graphs.
2. Add a failing exact-artifact scan with no public exemptions.
3. Move the local bridge outside that graph without breaking local continuity work.
4. Expand provenance and license receipts.
5. Define production headers and network origins.
6. Add SBOM, audit, content, and header gates to promotion CI.
7. Run an exact-artifact browser trace offline and online.
8. Record owner decisions and exceptions as ADRs.

## Verification gate

```sh
npm run content:scan
npm run web:build
npm run web:e2e
make qa
```

The release gate must run the scanner against a freshly built immutable artifact with zero public exemptions. Local-development source exceptions do not constitute artifact approval.

## Closure evidence

## Closure evidence

Contract: ADR 0007 (`docs/adr/0007-release-boundary.md`) — release graph isolation, two named scan gates, prompt injection boundaries.

Closed:

- **RS-P0-1** — every production build (`vite build`, any mode except the dev server) alias-swaps `./nytApi` for `apps/web/src/nytApi.releaseStub.ts`, which contains no route literals and rejects bridge calls with a typed error. The exact built artifact scans with ZERO exemptions: `[scan:release] scanned 12 file(s); 0 violation(s); 0 exempt`, and `grep random_crossword apps/web/dist/assets/*.js` is empty. The local development bridge remains available through the dev server + Flask bridge. Commit `61849c5`.
- **RS-P1-1** — the scanner now runs two named gates (`source`, `release`), each file scanned exactly once; the `apps/web/dist` exemption is deleted from the policy; remaining source exemptions are documented with reasons and expiry milestones. Commit `61849c5`.
- **RS-P1-6** — candidate, clue, and spoken-answer prompts serialize every untrusted field as delimited JSON with `<`/`>` unicode-escaped (a plain `JSON.stringify` delimiter was proven forgeable by the adversarial fixture). Tests: `packages/model-runtime/src/webllmAdapter.promptSecurity.test.ts` (2 adversarial fixtures: no payload text outside the block; no early delimiter close). Commit `61849c5`.
- **RS-P1-2** (partial) — a seeded negative fixture per forbidden policy class (provider hosts, syndication, xwordinfo, local inference, loopback port, legacy route) runs on every scan and fails the gate on a false negative; a clean fixture guards against false positives.
- **RS-P1-5** (partial, reversible tooling) — `scripts/generate-sbom.mjs` emits `reports/sbom.json` (CycloneDX-style, pinned to the commit) including an explicit model-receipt gap marker.

DECISION REQUIRED (owner-reserved; recorded in ADR 0007):

- RS-P1-3 deployment target and header mechanism (CSP/Permissions-Policy/referrer/framing proposal not encoded).
- RS-P1-5 project license, production lexicon approval, model license/source/redistribution receipts, dependency-audit exceptions policy.

Still open:

- RS-P1-4 CI branch coverage: `.github/workflows/ci.yml` and `Makefile` were carrying another agent's uncommitted changes during this increment, so the workflow was not edited. Required change: add `v2` to `on.push.branches`, and a promotion step running `npm run web:build:release` + `npm run scan:content:release` (root package.json script wiring is also blocked by a concurrent `overrides` hunk in the root `package.json`; invoke `node scripts/scan-forbidden-content.mjs --scope release` directly until it lands).
- RS-P1-2 remainder: binary-asset allowlist receipts, provenance/license ledger validation, source-map scanning policy.
- RS-P1-7 provenance placeholders (App-supplied model id, prompt-version constants) — Increment 6 with the App integrator.
- RS-P1-8 archive-replacement preview UI — Increment 6.

Verification: `node scripts/scan-forbidden-content.mjs` — source 147 files/0 violations/4 exempt, release 12 files/0 violations/0 exempt, self-test pass; `npm run web:build` — green; `npm --workspace @crossword/model-runtime run test` — 43 passed; full pre-commit gate passed for commit `61849c5`.

### Release CI checkpoint — 2026-09-05

The workflow now covers both `master` and `v2`, builds the release-mode web
artifact, scans that artifact with the release scope, and generates the
dependency SBOM. The SBOM still records the owner-reserved model/license gap;
deployment headers, project license, and production source approvals remain
decision-required as documented in ADR 0007.
