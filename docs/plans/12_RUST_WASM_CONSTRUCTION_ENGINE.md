# Rust/Wasm construction engine plan

Status: decision and implementation checkpoint, 2026-09-05.

## Implementation checkpoint

The first bounded spike is now present behind the TypeScript worker boundary:

- ADR 0009 freezes Fill Contract v1, including normalization, hard constraints,
  deterministic ordering, node budgets, and anytime telemetry.
- `crates/crossword-fill-core` is a native-testable Rust implementation of the
  current per-length bitset CSP: crossing propagation, all-different deletion,
  reversible trails, MRV/degree ordering, seeded values, locks, exclusions,
  poor-entry quotas, branch-and-bound, and resumable `step` chunks.
- `crates/crossword-fill-wasm` exposes the contract handshake and opaque
  `Engine`/`Solve` handles through `wasm-bindgen` using camelCase wire fields.
- `packages/construction/src/engines` contains the TypeScript reference adapter
  and a guarded Wasm adapter; the construction worker still defaults to the
  TypeScript engine and can fall back without changing puzzle/session data.

Native Rust tests, warnings-denied Clippy, the wasm target check, construction
tests, web tests, the production web build, content scan, coverage, Playwright,
and the construction mutation gate pass at this checkpoint. This is not a
promotion decision: the real-browser Wasm smoke, generated artifact/cache
integration, language-neutral differential harness, legal benchmark corpus,
and A/B/C/D performance evidence remain open. No Wasm default is permitted
until those gates and the owner budgets below are recorded.

## Decision

**Yes: begin a bounded Rust-to-WebAssembly construction-engine spike now. Do
not begin a Rust rewrite of the application.**

The candidate for Rust is the pure, CPU-bound **grid-fill search kernel** that
assigns words to slots under crossing, uniqueness, exclusion, lock, and quality
constraints. The existing TypeScript worker/client seam makes that experiment
cheap enough to justify. The player-facing solver, clue interaction, session
state, scoring, checking, persistence, topology policy, personalization, LLM
broker, and clue generation stay in TypeScript.

Promotion is conditional. TypeScript remains the reference engine and fallback
until the Wasm engine passes differential correctness, quality, cancellation,
browser, bundle, memory, and measured performance gates. A mechanical Rust port
that is not materially faster end-to-end does not ship.

This refines, rather than reverses, the master-plan decision to start with a
TypeScript bitset CSP and require benchmark evidence for Rust/Wasm. The current
TypeScript engine is now substantial enough to be an oracle, the construction
worker is a suitable boundary, and representative benchmarking can start. The
editorial objective and advanced search strategy are still changing, so a
big-bang rewrite would be premature.

## Terminology: two different “solvers”

| Meaning | Language decision | Reason |
| --- | --- | --- |
| Construction fill solver: fills a blank topology with answer candidates | Rust/Wasm spike now | Hot, deterministic, data-oriented search with bitsets and backtracking |
| Player solve/session engine: typing, navigation, direction, checking, scoring, undo, voice commands | Keep TypeScript | Product state machine, not a compute bottleneck; closely coupled to UI, persistence, and accessibility contracts |

No Luna assignment may use “solver” without saying which one it means.

## Why this is the right time—and why it is not yet rewrite time

The repository already has the necessary preconditions for a useful language
experiment:

- `packages/construction/src/csp.ts` implements bitset domains, position/letter
  indices, maintained arc consistency, MRV/degree ordering, seeded value
  ordering, all-different propagation, undo trails, node budgets, cancellation,
  and anytime-result telemetry.
- `apps/web/src/constructionClient.ts` and the construction worker protocol
  provide a replaceable adapter boundary away from React.
- A TypeScript implementation and small performance gate already exist, so Rust
  can be tested against behavior rather than invented in isolation.
- Browser construction already runs off the UI thread. Wasm therefore changes
  the implementation of a worker-owned use case, not the product architecture.

But Rust does not repair the remaining hard problems by itself:

- the editorial objective is still too coarse and partly topology-constant;
- the live upper bound, candidate scoring, search portfolio, nogoods, and
  decomposition need algorithm work;
- model preference/confidence and learner features need calibration;
- generation reproducibility and construction telemetry need manifest support;
- clue validation, theme placement, and editorial evaluation remain separate;
- the benchmark corpus is too small to justify a production switch.

The current move is therefore a **dual-engine, same-contract experiment**. First
separate language effects from algorithm effects. Only then decide whether Rust
becomes the default implementation.

## Scope boundary

### Port in the spike

- candidate interning and length buckets used by fill search;
- slot-domain construction from length, pattern, locks, exclusions, and minimum
  entry-quality gates;
- crossing constraint indices and bitset-domain intersection;
- all-different answer propagation;
- worklist-based propagation and reversible trail;
- deterministic variable and value ordering;
- branch-and-bound/anytime search with explicit node budgets;
- incumbent, bound, optimality-gap, termination, and failure telemetry;
- a chunked `step` interface for progress and cooperative cancellation.

### Keep in TypeScript

- React and all player interaction/session behavior;
- the `PuzzleFillGrid` application port and use-case orchestration;
- worker lifecycle, request identity, progress projection, and hard cancellation;
- LLM/WebLLM loading, candidate-bag prompting, parsing, and clue generation;
- lexicon source ingestion, licensing/provenance policy, and artifact selection;
- topology selection/validation unless profiling later proves topology search hot;
- quality policy, day calibration, personalization, manifest assembly, and
  editorial release gates;
- IndexedDB, service-worker, PWA, and Cloudflare deployment behavior.

### Explicitly out of scope for version 1

- Wasm threads, `SharedArrayBuffer`, SIMD requirements, or WebGPU compute;
- direct DOM or React imports in Rust;
- filesystem, network, clock, or nondeterministic RNG access in the Rust core;
- running an LLM in Rust;
- replacing the TypeScript engine before the promotion gates pass;
- changing the fill objective merely to make the Rust port easier;
- generated topology search or 21x21/Sunday construction;
- native/mobile bindings marketed as a reason for the port.

## Target architecture

```text
React / application use case (TypeScript)
                 |
          PuzzleFillGrid port
                 |
       construction worker (TypeScript)
        /                         \
TsFillEngine                 WasmFillEngine
(oracle/fallback)            (adapter + loader)
        \                         /
          versioned FillRequest
          versioned FillResult
                    |
       crossword-fill-core (Rust)
     index -> propagate -> search -> telemetry
```

The TypeScript worker is the process boundary and arbiter. It owns request IDs,
engine selection, progress throttling, cancellation, error normalization, and
fallback. Rust owns no browser lifecycle.

## Contract to freeze before porting

Create `Fill Contract v1` before translating search code. The contract is
language-neutral and must be exercisable by both engines with the same fixtures.

### Mathematical model

For slots \(S = \{s_1, \ldots, s_n\}\), define one variable \(X_i\) per slot.
Its finite domain \(D_i\) contains licensed candidate IDs whose normalized word
length and fixed-letter pattern match the slot.

For every crossing between position \(p\) in slot \(i\) and position \(q\) in
slot \(j\), require:

\[
  X_i[p] = X_j[q]
\]

For ordinary non-rebus puzzles, require global answer uniqueness:

\[
  i \ne j \Rightarrow X_i \ne X_j
\]

Hard constraints include crossing equality, locks, excluded candidate IDs,
normalization/length, uniqueness, source-policy eligibility, and configured
entry-quality floors. Hard constraints never become weighted penalties.

The objective is a **versioned lexicographic vector**, not an undocumented sum:

1. feasible completion;
2. hard editorial acceptance gates;
3. minimum-entry-quality tier and weak-entry count;
4. aggregate fill quality;
5. bounded personalization/model preference;
6. deterministic tie-break.

Before Rust parity work starts, the construction owner must specify which terms
are live during search and which remain post-fill evaluation. A term that is
constant for a fixed topology must not appear to guide fill search. Every live
term needs an admissible upper bound or must be excluded from a claim of proven
optimality.

### Determinism

- Normalize words and assign candidate IDs in a documented stable order.
- Inject a 64-bit seed; do not consult wall-clock time or host randomness.
- Quantize search scores to named fixed-point integer units before crossing the
  JS/Wasm boundary. Do not rely on JavaScript/Rust floating-point sort quirks.
- Define all ties explicitly: slot ID, candidate score, seeded key, candidate ID.
- If several fills share the optimum, differential tests compare feasibility and
  objective first. Exact grid equality is required only when tie-breaking is in
  the normative contract.

### Termination and telemetry

Both engines return the same typed concepts:

- `solved`, `unsatisfiable`, `budget-exhausted`, `cancelled`, or `invalid-input`;
- best incumbent, if one exists;
- nodes visited and propagation revisions;
- best valid bound and objective gap, when mathematically valid;
- whether optimality or unsatisfiability was proven;
- elapsed time measured by the TypeScript host, never used for solver behavior;
- objective version, engine version, seed, lexicon artifact ID, and topology ID.

Node-budget semantics are normative. A wall-time budget is host scheduling policy
and must not be used to assert reproducibility.

## Wasm interface

Do not call JavaScript once per node or once per propagation event. Keep the
large, long-lived index in Wasm memory and communicate in coarse chunks.

Conceptual interface:

```text
create_engine(lexicon_artifact, contract_version) -> EngineHandle
start_solve(engine, packed_request) -> SolveHandle
step(solve, node_budget) -> Running(progress) | Finished(result)
take_result(solve) -> packed_result
drop_solve(solve)
drop_engine(engine)
```

The first spike may use `serde-wasm-bindgen` for speed of implementation, but
serialization cost must be reported separately. A promotable version should
benchmark packed typed arrays:

- UTF-8 word bytes plus offset/length tables;
- interned candidate and slot IDs;
- `Uint32Array` tables for intersections, positions, and domains;
- fixed-point `Int32Array` score components;
- a compact result containing chosen candidate IDs and telemetry.

Synchronous Wasm cannot observe a JavaScript `AbortSignal` while it owns the
worker thread. `step` therefore performs a deterministic number of search nodes,
then yields to TypeScript. TypeScript checks cancellation and posts throttled
progress between steps. Worker termination remains the bounded hard-stop path.

Do not start with Wasm threads. They add cross-origin-isolation, feature
detection, two-build, memory-sharing, and deployment complexity before the
single-worker kernel has demonstrated value.

## Rust implementation shape

Proposed new paths (names may be adjusted once by the scaffolding owner):

```text
Cargo.toml
Cargo.lock
rust-toolchain.toml
crates/crossword-fill-core/
  Cargo.toml
  src/
    lib.rs
    contract.rs
    index.rs
    domain.rs
    propagate.rs
    search.rs
    score.rs
    telemetry.rs
  tests/
    fixtures.rs
crates/crossword-fill-wasm/
  Cargo.toml
  src/lib.rs
packages/construction/src/engines/
  fillEngine.ts
  tsFillEngine.ts
  wasmFillEngine.ts
```

Keep the core crate native-testable and unaware of `wasm-bindgen`. The thin Wasm
crate owns ABI conversion and opaque handles. The core uses typed errors and
must not panic on external input. No `unsafe` is needed for the first spike; any
later use requires an ADR, a benchmark that justifies it, and focused tests.

Use `wasm32-unknown-unknown`, pin the Rust toolchain and matching
`wasm-bindgen` CLI/crate versions, and commit the lockfile. The target has no OS
services and ordinary threads are unavailable, which matches the intended pure
kernel. Official target and test guidance are linked under Sources.

## Evidence plan: distinguish language wins from algorithm wins

A Rust implementation can look impressive merely because it incorporates
algorithm fixes that were never applied to TypeScript. That is not evidence for
the language decision. Measure this matrix in order:

| Variant | Purpose |
| --- | --- |
| A. Current TypeScript | Historical baseline |
| B. Mechanical Rust parity | Isolate runtime/language and boundary costs |
| C. Optimized TypeScript parity | Price the obvious JS fixes before adding a second toolchain |
| D. Optimized Rust parity | Fair production-candidate comparison |
| E. Search-policy variants on the winning kernel | Evaluate ILDS, best-first/beam, nogoods, decomposition, or a portfolio without confounding them with the port |

The optimized TypeScript control should at minimum investigate the current
allocation-heavy compatible-domain construction, string-keyed position maps,
worklist shifting, live-domain upper bounds, and progress-yield frequency. It
must preserve Fill Contract v1. If those changes erase the Rust advantage, that
is a successful experiment, not a failed project.

### Current checkpoint baseline

On 2026-09-04, `npm run test:perf` on the current development machine/worktree
reported:

| Existing fixture | Result | Wall time | Nodes | Score |
| --- | --- | ---: | ---: | ---: |
| `human-15x15` | solved | 7,374 ms | 159 | 36.2 |
| `monday-00805` | solved | 1,968 ms | 5,896 | 35.1 |
| `monday-01254` | solved | 2,125 ms | 2,468 | 35.8 |

The existing gate passed, but these three single runs are **diagnostic only**:
they do not measure cold versus warm costs, use distributions, record machine
metadata, isolate index time, or establish a legal public promotion corpus. The
two `monday-*` masks are read from a private `/tmp` archive and must not be
committed or treated as product fixtures. L0 replaces this evidence before any
Rust promotion decision.

### Corpus

Replace the three-case timing script as the sole evidence source with a checked,
license-safe benchmark corpus. Include:

- synthetic micro-CSPs with a brute-force-known solution count;
- small satisfiable and unsatisfiable grids;
- locked-letter and partially filled grids;
- exclusions and all-different collisions;
- low-quality-floor and empty-domain failures;
- deliberately adversarial late contradictions;
- easy through hard curated 15x15 topologies;
- topology/candidate combinations with several equal optima;
- anytime cases where a valid incumbent exists before proof;
- cancellation and node-budget boundaries;
- lexicons at several sizes and ambiguity distributions.

Each fixture records its provenance, license class, topology ID, lexicon artifact
ID/hash, contract/objective version, seed set, and expected invariants. No NYT
answer, clue, grid, or derived private archive becomes a committed benchmark.

Run at least 20 deterministic seeds where seed affects ordering. Report the
distribution, not only a median. Separate cold browser initialization from warm
construction, and separately report index build/reuse.

### Metrics

Correctness and quality:

- satisfiable/unsatisfiable agreement;
- hard-constraint violations (must be zero);
- objective-vector and incumbent-quality agreement;
- proof/termination agreement under equal node budgets;
- success rate and accepted-puzzle yield by difficulty band.

Performance and product cost:

- cold Wasm fetch/compile/instantiate time;
- lexicon transfer and index-build time;
- warm time to first valid incumbent;
- warm time to target quality and to proof;
- nodes and propagation revisions per second;
- p50, p95, and worst-case wall time;
- peak worker memory and retained memory after teardown;
- uncompressed, Brotli, and gzip Wasm bytes;
- main-thread long tasks (must remain absent);
- repeated-batch battery/energy proxy on one named reference device, with thermal
  state and browser version recorded.

Do not mix lexicon loading, LLM inference, clueing, and fill-kernel time into one
opaque number. Report both kernel-only and end-to-end construction latency.

### Promotion gates

All correctness gates are absolute:

- zero hard-constraint, invalid-result, panic, or memory-corruption failures;
- language-neutral property/oracle suite passes in native Rust, Node/TypeScript,
  and a real browser Wasm run;
- equal or better accepted-fill rate and objective vectors under equal budgets;
- cancellation completes within one configured step plus worker-shutdown grace;
- 100 repeated create/solve/drop cycles show no monotonic retained-memory growth;
- unsupported Wasm initialization cleanly selects the TypeScript engine.

The owner chooses final product budgets in the benchmark ADR. Recommended
initial promotion threshold: Rust must deliver either **at least 2.0x warm
kernel throughput** or **at least 30% lower end-to-end p95 fill latency** on the
hard representative band, while meeting every correctness/quality gate. Its
cold overhead must amortize within one normal local puzzle-generation batch.
Compressed Wasm and memory budgets must be explicit before promotion; do not
retrofit them after observing the artifact.

If Rust clears correctness but not performance, retain the crate as an
experimental branch or remove it. Do not ship dual-engine complexity because a
benchmark is “close.”

## Test and verification architecture

### Contract fixtures

Store a small, readable JSON fixture form as the source of truth and generate
packed/binary benchmark artifacts deterministically. Both engines consume the
same semantic fixture. The generator is checked for stable output.

Required fixture assertions:

- every selected candidate belongs to its original domain;
- crossing letters agree;
- locks and exclusions hold;
- answer uniqueness holds when enabled;
- hard quality gates hold;
- returned objective recomputes independently;
- a claimed bound is admissible;
- `provenOptimal` implies a zero valid gap;
- a claimed unsatisfiable result agrees with brute force on tractable cases;
- node-budget and cancellation results never pretend to be proofs.

### Independent oracles

- Keep a deliberately simple brute-force TypeScript/Python oracle for tiny
  fixtures. It should optimize clarity, not speed.
- Keep the production TypeScript CSP as the large-case differential oracle while
  Rust is experimental.
- Recompute objectives in a policy module independent from the search engine.
- For multiple valid optima, compare feasibility and normative objective/ties,
  not incidental traversal order.

### Rust tests

- unit tests for bitset masking, tail words, intersection lookup, trail restore,
  score quantization, and bound calculations;
- `proptest` generators for small CSPs, compared with brute force;
- native integration tests for every contract fixture;
- `wasm-bindgen-test` smoke and lifecycle tests in a real browser;
- fuzz external request decoding and lexicon/index artifact decoding before
  accepting either as trusted internal state;
- `cargo fmt`, `clippy` with warnings denied for owned crates, and native tests;
- `cargo-mutants` on the pure core crate, with a checked baseline and explicit
  exclusions only for demonstrated equivalents/timeouts;
- native coverage for diagnostic value; mutation score remains the stronger
  meta-test.

### TypeScript/browser tests

- differential adapter tests that run both engines over the same fixture;
- worker protocol tests for stale result/progress IDs, cancellation, malformed
  Wasm results, initialization failure, and fallback;
- Playwright construction smoke for Wasm load, offline cached reload, cancel,
  retry, worker teardown, and TypeScript fallback;
- service-worker tests proving the hashed Wasm artifact is cached/versioned and
  an old JS shell cannot load an incompatible ABI;
- CSP and worker mutation targets remain under Stryker; Rust logic moves under
  `cargo-mutants` rather than disappearing from mutation accountability.

### CI lanes

Keep fast pull-request checks small:

1. TypeScript lint/type/test and contract fixtures;
2. native Rust fmt/clippy/test;
3. one headless-browser Wasm contract smoke;
4. artifact-size budget.

Run full seed matrices, browser matrices, mutation testing, fuzzing, retained
memory, and energy experiments on scheduled/manual promotion lanes. Performance
regressions use a controlled runner; noisy shared CI timings are evidence logs,
not hard release gates.

## Staged implementation and rollback points

Every phase ends with a usable repository state. No phase requires deleting the
TypeScript engine.

### Phase 0 — contract and benchmark foundation

Deliver:

- ADR for Fill Contract v1, objective versioning, engine selection, and rollback;
- language-neutral fixture schema and tiny brute-force oracle;
- legal representative corpus and benchmark runner producing JSON plus a human
  summary;
- baseline A measurements, including current TypeScript and optimized-control
  candidates identified but not silently mixed into the baseline.

Rollback: documentation and fixtures remain useful even if Rust is rejected.

Exit: every current `FillResult` state maps unambiguously into the contract and
the corpus exposes at least one satisfiable, unsatisfiable, budgeted, anytime,
and cancellation case.

### Phase 1 — hollow Wasm vertical slice

Deliver:

- pinned Rust workspace/toolchain and reproducible Wasm build;
- native-testable core crate plus thin `wasm-bindgen` crate;
- one trivial fixture crossing the real worker boundary;
- build, size, CSP/header, cache, and offline-loading evidence;
- forced initialization-failure test proving TypeScript fallback.

Rollback: remove the experimental engine flag; TypeScript behavior is unchanged.

Exit: a production build and browser test load the pinned Wasm artifact without
network access after initial cache, and ABI mismatch fails closed.

### Phase 2 — mechanical parity kernel

Translate the current algorithm without introducing new search ideas:

1. candidate/slot interning and domain bitsets;
2. crossing and position-letter indices;
3. propagation and all-different deletion;
4. trail/restore;
5. deterministic MRV/degree and candidate ordering;
6. branch-and-bound, budgets, incumbent, and telemetry;
7. chunked stepping/cancellation.

Rollback: Wasm remains behind an experimental selector; fixture and contract
work remains.

Exit: differential correctness passes all fixtures and generated small CSPs.

### Phase 3 — fair ablation and optimization

Measure A/B/C/D. Optimize representation and allocation without changing
semantics. Profile before each optimization; attach before/after data. Potential
experiments include reusable scratch bitsets, compact adjacency arrays, a ring
worklist, live-domain bounds, cache-friendly candidate tables, and step-size
tuning.

Rollback: revert an isolated optimization that fails its benchmark or property
tests; do not weaken the gate.

Exit: publish reproducible correctness, latency, throughput, size, memory, and
energy results and make an explicit promote/reject decision.

### Phase 4 — guarded product integration

Only after promotion:

- default to Wasm on supported clients;
- retain explicit development selection and automatic TypeScript fallback;
- write engine/ABI/objective versions into construction telemetry and manifests;
- add a local diagnostic export without candidate words or personal profile
  contents;
- monitor failure/fallback rates locally and expose them to the owner.

Rollback: one configuration change restores TypeScript default. Persisted
puzzles and sessions contain no engine-specific representation.

### Phase 5 — search research, after the port decision

Evaluate algorithmic improvements independently of the language decision:

- improved admissible bounds based on current live domains and uniqueness;
- limited-discrepancy search for strong-but-imperfect value heuristics;
- bounded best-first/beam modes for fast incumbents;
- conflict-directed backjumping and compact nogood recording;
- articulation/decomposition when the constraint graph permits it;
- restart/portfolio policies across deterministic seeds;
- explicit multi-objective Pareto or lexicographic editorial evaluation.

Compare each with the same corpus and objective. “More nodes per second” is not
state of the art if accepted-fill rate or time to a good incumbent regresses.

## Luna execution map

Assignments are ordered to avoid shared-file collisions. Luna agents are not
alone in this repository: each must inspect the dirty worktree, preserve other
agents' edits, and commit only explicitly owned files. `App.tsx`, solver UI,
voice mode, CSS, and persistence are unowned and must not be touched.

```text
L0 contract + fixtures ─┬─> L1 Rust scaffolding ─> L3 Rust kernel ─┐
                       └─> L2 TS engine boundary ────────────────┤
L0 baseline runner ───────────────────────────────> L4 differential/bench
L1 + L2 + L3 + L4 ───────────────────────────────> L5 browser integration
L4 + L5 evidence ─────────────────────────────────> owner promotion decision
```

### Luna L0 — contract, oracle, and corpus

Ownership:

- new Fill Contract ADR;
- new language-neutral construction fixture schema/data;
- new tiny brute-force oracle and its direct tests;
- replacement/extension of `scripts/fill-perf-gate.mjs` into a reproducible
  correctness/benchmark runner;
- no production solver implementation.

Prompt:

```text
Work in /Users/arphen/projectc/crossword. Read AGENTS.md and
docs/plans/12_RUST_WASM_CONSTRUCTION_ENGINE.md completely. You own only the new
Fill Contract ADR, legal language-neutral fill fixtures, a tiny clarity-first
brute-force oracle, and benchmark/fixture scripts plus their tests. Other agents
are active; do not revert, format, stage, or commit unrelated changes. Do not
touch App.tsx, CSS, voice, persistence, the production CSP, or lockfiles.

Specify Fill Contract v1 precisely: normalized IDs, hard constraints,
objective-vector units/order, deterministic ties, node-budget semantics,
termination, incumbent/bound/gap/proof telemetry, and schema versioning. Create
license-safe satisfiable, unsatisfiable, locked, excluded, all-different,
budgeted, anytime, and cancellation fixtures. The tiny oracle must independently
recompute validity/objective and enumerate tractable optima. Make the runner emit
machine-readable JSON and a concise human table, separating cold/index/warm
timings. Record baseline evidence; do not make Rust claims yet. Use apply_patch,
run focused tests and make doctor, and report exact owned paths and commands.
```

Exit: fixture schema and oracle find deliberate invalid-result, false-proof,
inadmissible-bound, and off-by-one-budget mutants.

### Luna L1 — Rust workspace and hollow vertical slice

Depends on: L0 contract draft stable.

Ownership:

- root Rust workspace/toolchain files;
- `crates/crossword-fill-core/**` scaffolding;
- `crates/crossword-fill-wasm/**` scaffolding;
- dedicated Rust build scripts/configuration and focused CI entries;
- no TypeScript production adapter.

Prompt:

```text
Implement Phase 1 scaffolding from
docs/plans/12_RUST_WASM_CONSTRUCTION_ENGINE.md. Read AGENTS.md and the approved
Fill Contract ADR first. You own only the pinned Rust workspace/toolchain, the
new pure core crate, the thin wasm-bindgen crate, dedicated build scripts, and
focused CI changes agreed with the maintainer. You are not alone in the
worktree; preserve every unrelated edit. Do not edit application/UI/CSS/voice,
the existing CSP, worker/client code, service worker, or general package
dependencies unless ownership is explicitly expanded.

Use wasm32-unknown-unknown. Pin compatible wasm-bindgen crate and CLI versions.
Keep the core native-testable, deterministic, browser-free, and panic-free on
external input. Implement only version handshake, typed request/result echo for
one tiny contract fixture, opaque handle lifecycle, and build/test plumbing—not
the solver. Report native test, wasm browser smoke, reproducible build, and raw/
gzip/Brotli sizes. Do not add threads, SIMD, unsafe, or algorithm changes.
```

Exit: clean checkout can produce the same logical artifact with the pinned
commands and an ABI mismatch is a typed error.

### Luna L2 — dual-engine TypeScript boundary

Depends on: L0 contract; may run parallel with L1 after the contract stabilizes.

Ownership:

- new `packages/construction/src/engines/**` adapter files and tests;
- construction worker protocol/client files strictly needed for versioned engine
  selection, chunk progress, cancellation, and fallback;
- no CSP algorithm changes and no Rust files.

Prompt:

```text
Implement the TypeScript dual-engine boundary in Phase 1. Read AGENTS.md,
docs/plans/12_RUST_WASM_CONSTRUCTION_ENGINE.md, and the Fill Contract ADR. Own
only new fill-engine adapters and the minimum construction worker protocol/
client changes plus direct tests. Other agents are active; preserve all
unrelated modifications. Do not touch App.tsx, CSS, voice, persistence, Rust,
the CSP algorithm, LLM/clue orchestration, or service-worker caching.

Wrap the current CSP as TsFillEngine without semantic changes. Define the
WasmFillEngine adapter against a fake loader until L1 lands. The TypeScript
worker remains arbiter of request identity, progress throttling, cancellation,
hard termination, typed errors, and automatic fallback. Add tests for ABI
mismatch, init failure, stale progress/results, cancellation between steps,
malformed Wasm output, teardown idempotence, and preserved TS behavior. Keep
the selector experimental and default to TypeScript.
```

Exit: current construction tests pass unchanged through `TsFillEngine`; every
Wasm failure path returns to a known state without reusing stale handles.

### Luna L3 — mechanical Rust parity

Depends on: L0, L1.

Ownership:

- `crates/crossword-fill-core/**` implementation/tests;
- `crates/crossword-fill-wasm/**` ABI translation/tests;
- no TypeScript files except generated ABI declarations if L1 explicitly owns
  their generator/output path.

Prompt:

```text
Translate Fill Contract v1 and the current TypeScript CSP into the Rust core.
This is mechanical parity, not search research. Read AGENTS.md, the Rust/Wasm
plan, contract ADR, current csp.ts, and contract fixtures. Own only both Rust
crates and their tests. You are not alone in the repository; do not revert or
touch TypeScript application/UI/worker/CSP files.

Implement stable candidate/slot IDs, domain bitsets, position-letter indices,
crossing propagation, all-different deletion, reversible trail, deterministic
MRV/degree and value ordering, branch-and-bound, node budgets, incumbents,
bounds/gaps/proofs, typed failures, and chunked step state. Use fixed-point
scores and injected seed. No time-based decisions, threads, SIMD, unsafe,
filesystem, network, or per-node JS callbacks. Add unit, proptest, native
fixture, wasm-bindgen browser, malformed-input, and lifecycle tests. If current
TypeScript behavior conflicts with the approved contract, implement the
contract and report the mismatch; do not copy a bug.
```

Exit: native and Wasm Rust runs satisfy all fixtures and small generated cases
against the independent oracle.

### Luna L4 — differential testing, mutation, and ablation

Depends on: L0–L3 merged or available without file conflicts.

Ownership:

- differential/property harnesses;
- benchmark reporting and checked threshold configuration;
- Rust mutation configuration and focused TypeScript mutation targets;
- narrowly scoped same-contract TypeScript optimizations, one at a time, only
  after baselines are frozen.

Prompt:

```text
Execute the A/B/C/D evidence matrix from the Rust/Wasm construction plan. Read
AGENTS.md, the contract ADR, and all earlier evidence. You own differential and
benchmark harnesses, mutation configuration, reports, and only separately
approved same-contract optimizations in csp.ts. Preserve unrelated dirty-worktree
changes; do not touch UI/CSS/voice/persistence/LLM/clue code.

First freeze A current TypeScript and B mechanical Rust results. Then profile
and implement one C TypeScript optimization per commit with parity tests and
before/after data. Apply equivalent justified optimizations for D through the
Rust owner or in non-overlapping commits. Report cold instantiation, index,
warm incumbent/target/proof, throughput, p50/p95/worst, memory, artifact sizes,
and repeated-batch energy proxy. Run cargo-mutants on the pure core and Stryker
on the adapter/remaining CSP boundary. Never change fixtures, budgets, objective,
or algorithm between variants to manufacture a win.
```

Exit: a reproducible report supports `promote`, `continue experiment`, or
`reject`; no ambiguous “felt faster” conclusion is accepted.

### Luna L5 — browser/PWA integration

Depends on: owner records a promotion decision after L4.

Ownership:

- Wasm asset loading/build integration;
- construction worker adapter integration;
- service-worker compatibility/cache tests for the Wasm asset;
- Playwright construction lifecycle tests;
- no player-solver UI or visual redesign.

Prompt:

```text
Integrate the Wasm fill engine only because the recorded promotion decision
passed every gate. Read AGENTS.md, the Rust/Wasm plan, Fill Contract ADR, and L4
report. Own Wasm build/asset loading, construction worker integration,
service-worker compatibility/cache tests, and focused Playwright construction
lifecycle tests. Other work is concurrent; do not touch App.tsx, solver UI,
CSS, voice, persistence schemas, LLM/clue behavior, or objective policy.

Default selection must be feature/version gated and retain TypeScript fallback.
Prove offline reload after initial cache, ABI-version invalidation, stale shell/
new Wasm and new shell/stale Wasm failures, cancel/retry, worker hard stop,
teardown, and unsupported-client fallback. Record engine/ABI/objective versions
in construction telemetry without exposing candidate bags or user-profile data.
Keep one-switch rollback to the TypeScript default.
```

Exit: the production artifact meets size/cache/offline gates and disabling Wasm
changes no persisted puzzle or solve-session format.

## Owner decisions before Phase 1 can merge

- Approve Fill Contract v1 and its objective ordering/quantization units.
- Approve the legal benchmark lexicon and topology corpus.
- Choose concrete compressed-Wasm and peak-worker-memory budgets.
- Choose reference browser/device and acceptable batch energy regression.
- Decide whether fallback is silent, locally surfaced, or both; it must never
  claim the Rust engine ran when it did not.
- Decide the minimum supported browser matrix for Wasm. This is distinct from
  optional future thread/SIMD support.

The Rust spike itself does not require deciding whether Rust is permanent.

## Definition of done

This plan is complete only when the repository contains:

- a reviewed Fill Contract v1 and independent oracle;
- a legal, representative, versioned benchmark corpus;
- reproducible A/B/C/D correctness/performance/size/memory evidence;
- native and real-browser property/differential tests;
- mutation evidence for both sides of the language boundary;
- a documented promote/reject decision against predeclared budgets;
- a default/fallback/rollback path with no persistence coupling;
- no regression to player solving, clue generation, privacy, offline behavior,
  accessibility, or the construction worker's responsiveness.

## Sources

- Rust's official [`wasm32-unknown-unknown` target
  notes](https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-unknown-unknown.html)
  document the target's Tier 2 status and lack of OS facilities/ordinary threads.
- The official [`wasm-bindgen-test`
  guide](https://rustwasm.github.io/docs/wasm-bindgen/wasm-bindgen-test/usage.html)
  covers Rust/Wasm browser testing and version-compatible CLI use.
- The official [Wasm-in-Web-Worker
  example](https://rustwasm.github.io/docs/wasm-bindgen/examples/wasm-in-web-worker.html)
  supports retaining the repository's worker boundary.
- The Rust and WebAssembly book's [profiling and code-size
  guidance](https://rustwasm.github.io/book/print.html) emphasizes measurement,
  minimizing boundary copying, and keeping large long-lived structures behind
  opaque Wasm handles.
- [`serde-wasm-bindgen`](https://github.com/RReverser/serde-wasm-bindgen) is a
  practical spike codec using native JS values; its conversion cost still needs
  measurement against packed typed arrays.
- [`cargo-mutants`](https://github.com/sourcefrog/cargo-mutants) provides the
  Rust mutation-testing lane for the pure core crate.
