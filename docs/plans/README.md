# Crossword next-generation master plan

Status: canonical planning index, 2026-08-29.

## North star

Turn the loved desktop crossword companion into an original, private,
AI-enabled crossword product that grows with its players without becoming a
personalized exam. Preserve the concentric Across/grid/Down composition, the
two-lane clue-number spines, linked answer patterns, daily rhythm, wordplay,
surprise, and useful repetition. Remove public dependence on NYT content and
ship a polished static application with no application backend or server
database.

Original construction requires an enabled local LLM. The model supplies
semantic breadth, personalized candidate material, and clue language; the
licensed lexicon, constraint engine, and validators own truth and grid quality.
Generation can prepare a local queue and unload the model so ordinary solving
is offline, responsive, and battery-calm. There is no generic non-AI constructor
and no hidden cloud-inference fallback.

## Read in this order

1. [Legacy audit and recovered intent](00_LEGACY_AUDIT.md) — what exists, what
   history and sibling repositories contain, and what must not be copied.
2. [Product and solving experience](01_PRODUCT_EXPERIENCE.md) — the interaction,
   visual, accessibility, personalization, and day contracts.
3. [Puzzle intelligence](02_PUZZLE_INTELLIGENCE.md) — lexicon, required local
   model, topology, fill CSP, clue ladders, profile, and editorial gates.
4. [Architecture and migration](03_ARCHITECTURE_MIGRATION.md) — React/TypeScript
   clean architecture, workers, storage, hosting, and strangler phases.
5. [Quality and delivery](04_QUALITY_DELIVERY.md) — test portfolio, mutation,
   AI evals, security, content/legal scans, CI, and exact-artifact promotion.
6. [Execution backlog](05_EXECUTION_BACKLOG.md) — bounded work packages,
   sequencing, acceptance evidence, and the first ten pull requests.

These documents are contracts, not independent wish lists. A change that alters
a product invariant, public data format, source/license policy, AI requirement,
or dependency direction gets an ADR and updates the relevant plan in the same
change.

## Decided

- `crossword` remains the product repository and legacy behavior oracle.
- The current Flask/NYT application is a local-only continuity bridge during
  migration, never a public deployment target.
- Public artifacts contain no NYT route, cache, puzzle, fixture, solution link,
  or XWord Info dependency.
- The deployable app is a static React 19 + TypeScript + Vite PWA with clean
  domain/application boundaries and IndexedDB persistence.
- The local LLM is required for original construction and clueing. Deterministic
  constraints, licensed sources, and validators remain authoritative.
- Inference and fill run in dedicated workers; the model is unloaded during
  play after the local queue is prepared.
- Start with a TypeScript bitset CSP and a Python reference oracle. Rust/WASM
  requires benchmark evidence.
- Start with curated 15x15 topology templates. Generated topology and Sunday
  21x21 are later gates.
- User modeling is composite, named, local, inspectable, editable, exportable,
  and resettable—not one opaque interest vector.
- The clue spine and linked answer pattern are product identity, implemented as
  stable projections rather than CSS parity tricks.
- Accessibility, mutation strength, content provenance, offline behavior,
  performance, and energy are release gates.
- Real-time multiplayer is a separate architecture decision; frontend-only does
  not magically eliminate signaling.

## Delivery map

- **0. Trustworthy baseline:** reproducible legacy app, legal fixtures, export,
  and characterization; retain the local legacy source.
- **1. Static solver:** polished accessible offline PWA solving legal fixtures;
  retain the local legacy source.
- **2. Intelligence lab:** required local model plus deterministic mini
  constructor; retain the local legacy source.
- **3. Monday alpha:** personalized original 15x15 household queue; the local
  bridge becomes optional.
- **4. Public release:** static Cloudflare artifact with no NYT material or
  application backend; legacy is excluded entirely.
- **5. Day graduation:** Tuesday through Sunday pass separate editorial gates;
  legacy is removable or archive-only.

The shortest credible path to delight is not every feature at once: first make
the signature solver beautiful, stable, and accessible on legal fixtures; then
make excellent original Monday puzzles; then graduate days without lying about
their quality.

## Immediate next slice

Implement Milestone 0 through small reviewed changes:

1. pin/document the now-working `uv`/Node toolchain and add `doctor`;
2. repair ignored legacy browser assets and add a clean-clone mount smoke;
3. replace provider-derived default test data with provenance-recorded synthetic
   fixtures and isolate any private live integration test;
4. define and ship continuity export v1;
5. create the static workspace only after these safety rails exist.

Current audit evidence: the standardized setup completes and the legacy suite
passes 50 Python plus 6 JavaScript tests, but a real fresh browser load fails to
mount because ignored Vue/Axios/Socket.IO files return 404. npm also reports 13
legacy dependency vulnerabilities, including 9 high. Green tests are not yet a
runnable or deployable baseline.

## Decisions still requiring explicit owner review

- final project license and whether any GPL LACUNA implementation is reused;
- approved lexicon/knowledge sources and attribution distribution;
- pinned initial local model and supported device/memory floor after a spike;
- exact blinded-human thresholds for graduating each day;
- Cloudflare Workers Static Assets versus Pages after the static/model-hosting
  spike (the architecture supports either);
- whether later multiplayer is same-device, asynchronous exchange, WebRTC, or a
  separately hosted service.

Model brand, prompt wording, UI decoration, and solver implementation are
replaceable details. The product promises, content legality, dependency rule,
local privacy boundary, and evidence gates are not.
