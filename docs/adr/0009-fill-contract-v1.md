# ADR 0009: Fill Contract v1 and experimental engine boundary

**Status:** accepted for the Rust/Wasm spike, 2026-09-05
**Scope:** fixed-topology construction fill only

## Decision

The construction worker uses a versioned, language-neutral `FillRequest` and
`FillResult`. TypeScript remains the reference implementation and default
engine. The Rust/Wasm implementation is experimental until differential,
browser, quality, cancellation, memory, artifact-size, and performance gates
in [plan 12](../plans/12_RUST_WASM_CONSTRUCTION_ENGINE.md) are recorded.

The contract describes the pure grid-fill kernel. It does not include React,
player solving, clue generation, topology selection, learner-profile storage,
or model lifecycle.

## Request normalization and hard constraints

- Slot IDs are non-empty and unique. Slot lengths are positive integers.
- Patterns are exactly the slot length and contain only `A`–`Z` or `.`.
- Candidate words are trimmed, upper-cased, and eligible only when they contain
  ASCII `A`–`Z`, have finite scores, a non-empty lexeme ID, and at least one
  source ID. The first candidate for a normalized word wins.
- Exclusions compare normalized words case-insensitively.
- A lock names an existing slot and is a normalized word of that slot length.
  A valid lock is admitted as a candidate with lock provenance when the normal
  candidate bag does not contain it.
- Intersections name existing, distinct slots and in-range positions. The
  letters at both positions must agree.
- Ordinary fills enforce answer uniqueness. Root-family uniqueness is not yet
  in v1 because the current candidate contract has no validated root field.
- `poorEntryFloor`/`poorEntryLimit`, when supplied, are a hard incremental
  quota. A candidate is poor by `qualityScore` when present, otherwise by its
  search `score`.

Malformed requests return `failed/invalid-request`; they never panic or become
  an unsatisfiable proof. A valid request with no completion returns
  `failed/unsatisfiable`.

## Objective and deterministic behavior

The live search objective is the additive sum of finite candidate `score`
values. It is a search preference, not the application-level normalized
editorial quality score. A complete assignment must meet
`minimumAssignmentScore` when that first-acceptable mode is requested.

Candidates are ordered by descending score, then a seeded FNV-style 32-bit key,
then normalized word. Slot ties are resolved by domain size, crossing degree,
then input slot order. The seed is injected data; no wall clock or host RNG is
consulted. Scores remain IEEE-754 finite values at this boundary. A future
promotable packed ABI will quantize them to named fixed-point units before
crossing JS/Wasm.

## Termination telemetry

`termination` and `terminationReason` are identical and use:

- `exhausted`: search completed with an admissible bound;
- `satisfied`: first complete assignment met the requested minimum score;
- `node-limit`: the normative node budget was reached;
- `cancelled`: cooperative cancellation was observed between chunks;
- `unsatisfiable`: no valid completion exists (or initial propagation proves it).

`nodesExplored` counts entered search states, including the final incumbent
state. A result is `provenOptimal` only after exhaustive branch-and-bound; a
budgeted, cancelled, or first-acceptable incumbent is not a proof. `bestBound`
is the additive upper bound at termination when available, and `gap` is its
non-negative difference from the incumbent. Node budgets are deterministic;
wall time is host telemetry only.

## Wasm boundary

The thin Wasm crate exposes a contract-version handshake and opaque
engine/solve handles. `step(node_budget)` runs a bounded chunk and returns a
progress value or a final result. TypeScript owns request identity, worker
termination, cancellation signals, fallback, and progress throttling. There
are no JS callbacks per node, threads, SIMD requirements, filesystem, network,
clock, or unsafe code in the spike.

## Consequences

This freezes enough behavior for native and browser differential tests without
claiming that the current additive score is the final editorial objective.
The TypeScript implementation must be repaired or the contract amended before
either engine claims parity for a changed behavior. Benchmark and legal corpus
decisions remain owner decisions, not consequences of this ADR.
