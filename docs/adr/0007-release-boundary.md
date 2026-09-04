# ADR 0007: release graph isolation and promotion evidence

Date: 2026-09-04

Status: accepted for the release increment (RS-P0-1, RS-P1-1, RS-P1-2, RS-P1-6; partial RS-P1-3/4/5)

## Decisions

### 1. The release graph is mechanically different from development

`vite build --mode release` alias-swaps `./nytApi` for
`apps/web/src/nytApi.releaseStub.ts`, a self-contained module with **no route
literals** that rejects bridge calls with a typed error. The deployable
artifact therefore cannot contain the legacy provider routes even though the
development entry keeps the household continuity bridge.

### 2. Two named scan gates; the artifact gate has zero exemptions

`scripts/scan-forbidden-content.mjs` runs:

- `source` — apps/ + packages/ excluding the built artifact; the documented
  development exemptions apply (bridge loader, its tests, the dev proxy,
  negative e2e assertions). The private Flask bridge is out of scope by
  design.
- `release` — the exact `apps/web/dist` artifact with **exemptions ignored**.
  Zero hits or the gate fails. Each file is scanned exactly once per gate.

A seeded negative fixture per forbidden policy class runs on every scan; a
false negative in the scanner itself fails the gate.

### 3. Promotion builds and scans the release artifact

`npm run web:build:release` builds the promoted artifact (including the ADR
0006 precache injection); `npm run scan:content:release` gates it. CI wiring
for promotion branches is recorded in the review file's remaining work
(shared workflow file was carrying another agent's uncommitted changes at
implementation time).

### 4. Prompt injection boundaries (RS-P1-6)

Candidate and clue prompts serialize every untrusted field (seed, audience,
focus, exclusions, answer, intended sense) as delimited JSON blocks
(`delimitedBlock`) mirroring the existing spoken-answer pattern, with an
explicit treat-as-values instruction. Deterministic validators remain
authoritative over all model output.

## Owner decisions still reserved (recorded, not guessed)

- Final project license; production lexicon approval and redistribution
  status (RS-P1-5 receipts).
- Deployment target and the header mechanism that serves it (RS-P1-3).
- Model pin, device floor, and model redistribution policy.
- Blinded-human editorial graduation thresholds.
