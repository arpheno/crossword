# Legacy audit and recovered intent

Status: evidence baseline, 2026-08-29.

This document records what exists before the modernization starts. It is not a
backlog and it does not grant old implementation choices permanent status. Its
purpose is to stop future work from rediscovering the repository or confusing
an experiment with production architecture.

## Repositories and history reviewed

- `crossword`, all fetched local and `origin/*` branches, plus the full commit
  history from the first working version through `master` at `72ad116`;
- `optimize_crossword`, `main` at `60accf8`;
- `nontext` / LACUNA, `main` at `44c7964`;
- `lalange`, `main` at `8c247af`, as the working reference for a local-first
  React/TypeScript/Vite/PWA/WebLLM application.

No `AGENTS.md` exists in `crossword`. The `.cursorrules` and Copilot files
describe the current Flask/Vue conventions, but they are implementation-era
guidance rather than a product architecture mandate.

## Recovered documents

The suspected concept paper is not present on a current branch. Several useful
documents were added and later deleted:

- `3aa3deb:NEXT_GEN_PLAN.md` planned a parallel renderer for NYT-specific
  special cells and malformed grids;
- `3aa3deb:FRONTEND_CELL_DESIGN.md` established the position-indexed cell map
  and plain transport objects;
- `3aa3deb:IMPLEMENTATION_STATUS.md` recorded the first cell-model migration;
- `3aa3deb:GETTING_STARTED_V2.md` described the transitional V2 path.

These documents are about parsing and rendering syndicated puzzles, not
original construction or personalization. Their lasting contributions are the
rich cell model, explicit feature metadata, position-indexed cells, incremental
migration, and regression-first rollout. Their duplicated V1/V2 files,
date-coupled identity, and provider-specific transport should not be revived.

The original-generation concept lives in another repository:

- `nontext/docs/PROJECT MANIFEST_ LACUNA (The Lacanian Crossword Engine).md`
  proposes a pure client, WebLLM-assisted, Rust/WASM constraint engine;
- `nontext/solver` contains an early implementation;
- `nontext/client` contains a React interface experiment and behavior tests.

The direction is relevant. The current implementation is not production-ready:

- its "DAWG" is an in-memory `HashMap` trie built from JSON at runtime;
- propagation works on cell letter domains rather than scored word domains;
- it has no all-different constraint, answer scoring, clue system, provenance,
  reproducibility manifest, or personalization;
- the random layout generator checks rotational symmetry, connectivity, and
  minimum word length, but not fillability or day-specific construction style;
- generated grids are still displayed with the sample puzzle's clues;
- there are no Rust solver tests and only a thin React integration test.

Treat LACUNA as a spike and a vocabulary source, not as a codebase to merge.
Because it is GPL-3.0 while `crossword` declares MIT metadata, decide the product
license before copying any code. Ideas and independently reimplemented
interfaces are safer than an accidental license merge.

## What the current app does well

These are product assets and must have characterization coverage before a UI
rewrite:

1. Desktop has a center grid with Across and Down clue fields on opposing sides.
2. Each clue field wraps into two mirrored columns, placing clue numbers along a
   visual spine.
3. Every clue shows the answer pattern and entered letters. Pattern cells link
   back to exact grid cells.
4. Selecting a cell or clue links the active entry, crossing entry, grid cells,
   and corresponding answer-pattern cells.
5. Keyboard navigation, direction changes, checks, reveals, rebuses, shaded
   cells, circled cells, theme switching, completion effects, offline puzzle
   caching, solve history, and a local multiplayer experiment exist.
6. The Python parser has substantial regression coverage for the historical NYT
   format, numbering, notepads, special cells, and malformed lines.

The clue spine is the product's signature. It should be formalized as an
explicit layout component, not retained accidentally through `nth-child` CSS.

## Current structural risks

### Provider and identity coupling

- `src/crossword/app.py` directly proxies and fetches the NYT syndication
  endpoint.
- `random_crossword/<weekday>` means "choose a random historical date and fetch
  that NYT puzzle."
- `src/crossword/parser.py` is intentionally coupled to the syndication format.
- Puzzle identity is `metadata.date`; SQLite permits one completion per date.
- The UI links to XWord Info for the solution.

An original-puzzle product needs provider-neutral identifiers, a first-class
topology, stable cell and entry IDs, generation metadata, and source/license
provenance.

### Persistence and continuity

- Puzzle caches and a partial solve index live in `localStorage`.
- Completion metadata is duplicated in `localStorage` and SQLite.
- the solved-puzzle modal reads only the backend, so its offline fallback is
  incomplete;
- a puzzle in progress is not durably snapshotted;
- current cache removal consumes a puzzle as soon as it is loaded;
- historical export/import work in `c4545c6` and `b2ff67c` was later removed;
- no schema-versioned backup or migration contract exists.

Before storage is replaced, ship a versioned export that preserves preferences,
history, profiles, and in-progress original puzzles. NYT puzzle bodies must be
excluded from deployable/public exports by default.

### Learning signal

The app persists weekday, total wall-clock time, and score. It does not persist
active time, clue focus, first attempt, corrections, crossings present when an
entry was solved, checks, reveals, revisits, pauses, abandonment, clue
mechanism, or answer familiarity. The timer continues during inactivity. This
cannot support responsible personalization.

Completed words are keyed by clue text, so duplicate clue text can collide.
Events and state must use stable IDs.

### Frontend architecture and accessibility

- `main.js` is about 1,600 lines in one Vue 2 options object;
- `styles.css` is about 2,000 lines with overlapping historical rules;
- the Jinja template is about 435 lines and contains inline presentation rules;
- the page uses one input element per playable cell and recomputes many
  crossword-wide queries from template calls;
- there is no unified semantic grid/focus contract, focus restoration for
  modals, or reduced-motion policy;
- mobile multiplayer is a separate page rather than one responsive solving
  experience;
- there is only one narrow `max-width: 768px` media section for the desktop
  layout.

### Paint and energy risk

The historical `glow` commit added large text-shadow recipes and glass effects.
Some pulse keyframes are now unused, but the stylesheet still contains large
static glows, `backdrop-filter`, many shadows, and several `transition: all`
rules. The completion fireworks run a full-screen animation loop and audio
context. There is no `prefers-reduced-motion` branch or measured energy budget.

The target is not "no visual effects." It is effects with explicit ownership,
short lifetimes, composited properties, fallbacks, and measurements.

### Backend and security

- Flask app creation, database creation, routes, socket events, QR generation,
  and a macOS system-settings launcher share one module;
- Socket.IO accepts all CORS origins and stores rooms only in memory;
- room IDs are four random uppercase letters;
- one API endpoint launches System Settings on the host;
- network requests lack consistent timeouts and response-size validation;
- the Dockerfile, Makefile, CI branch filters, README, ports, and actual module
  paths disagree;
- the template references vendored Vue, Axios, and Socket.IO files that are not
  tracked in the current tree.

This backend is acceptable as a private continuity bridge, not as an Internet
deployment target.

## Test and delivery baseline

The repository has extensive parser/numbering tests but a very small JavaScript
suite. The two API integration tests depend on a mutable live NYT endpoint.
There are no end-to-end, property-based, mutation, accessibility, visual,
offline/PWA, solver, seeded reproducibility, security-header, or performance
tests. CI watches `main` and `fireworks`, while the default branch is `master`,
and CI does not run the JavaScript suite or a production build.

After standardizing the audit host on `uv` and Node LTS, `make setup` completed
and all 50 Python plus 6 JavaScript tests passed. A browser smoke still failed:
`static/lib/vue.js`, `axios.min.js`, and `socket.io.min.js` returned 404 and the
page displayed raw Vue expressions. npm also reported 13 legacy dependency
vulnerabilities, including 9 high. The test baseline is therefore green but the
documented fresh-clone product baseline is not runnable.

`lalange` demonstrates patterns worth reusing intentionally:

- pure TypeScript core modules separated from React components;
- a single local-model broker and worker boundary;
- lazy capability loading and explicit model policy;
- IndexedDB-backed local-first state;
- PWA update tests and runtime compatibility checks;
- Vitest, Testing Library, Playwright, deterministic performance contracts;
- Cloudflare staging followed by manual promotion of the exact tested artifact.

Do not copy all of `lalange`'s dependencies. Reuse its proven boundaries and
delivery practices, then choose the smallest crossword-specific dependency set.

## `optimize_crossword` disposition

`optimize_crossword` is a one-commit PuLP sketch. It assigns words to predefined
slots, creates a binary variable for every slot/word pair, and emits pairwise
constraints for every incompatible crossing combination. That formulation
grows badly for a production lexicon. Topology validation always returns true,
tests only assert true, and some modules do not import their referenced types.

Archive it as archaeology. Retain the `Slot`, `Overlap`, `CrosswordSolution`,
and generator-port vocabulary. Do not merge the implementation.

## Baseline decisions

1. `crossword` remains the product repository and legacy behavior oracle.
2. The Flask/NYT app remains local-only during migration.
3. The deployable product contains no NYT adapter, cached NYT puzzle, or XWord
   Info dependency.
4. The new application is a static TypeScript/Vite/PWA client with clean
   domain/application boundaries.
5. Browser workers own fill construction and local inference.
6. IndexedDB is the local persistence implementation; there is no server
   database.
7. A licensed, curated lexicon and deterministic validators are authoritative.
   The LLM is never authoritative for whether an answer or fact is valid.
8. The current LACUNA solver is a benchmark input, not the selected engine.
9. The clue spine, linked answer patterns, day progression, and collaborative
   play are product invariants.
10. No backend-free promise is made for real-time multiplayer until a separate
    P2P/signaling design passes its own review.
