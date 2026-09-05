# Full review increment 02: persistence and offline durability

Date: 2026-09-04

Priority: second implementation increment

Reasoning tier: superintelligence for data semantics; strong/Luna for implementation after the contract is fixed

## Outcome

The product currently has several independent notions of durability: IndexedDB repositories, a continuity archive, local storage, the application shell cache, the speech cache, and WebLLM's cache. Their ownership and ordering are not coordinated. That creates three immediate risks: model caches can be erased by an app update, the first successful visit may still fail offline, and delayed hydration can overwrite a user's first edits.

## PO-P0-1: service-worker activation deletes caches it does not own

Evidence:

- `apps/web/public/sw.js:14-20` deletes every cache key except `crossword-shell-v3`;
- `apps/web/src/speechCache.ts:3` owns `transformers-cache`;
- WebLLM uses CacheStorage-backed scopes such as `webllm/model` in the installed dependency.

An activation after a deploy can erase expensive speech and model downloads. CacheStorage is shared by origin; the shell worker must not garbage-collect names owned by other subsystems.

Required red test:

1. seed an old Crossword shell cache;
2. seed the current Crossword shell cache;
3. seed speech, WebLLM, and an unrelated foreign cache;
4. run activation;
5. assert that only shell caches with the product's owned shell prefix and obsolete version are removed.

Acceptance:

- every cache-owning subsystem has a documented prefix and cleanup owner;
- activation deletes only obsolete caches owned by the service worker;
- model and speech cache deletion occurs only through their explicit settings actions;
- the policy is tested outside a live browser and in one browser update journey.

## PO-P0-2: first-install offline boot is not established

`apps/web/public/sw.js:1-9` precaches only `/`, `/index.html`, and `/manifest.webmanifest`. Hashed JS, CSS, worker chunks, fonts, icons, construction lexicons, and other lazy assets are absent. `apps/web/src/main.tsx:31-40` registers the service worker after the current application has already loaded, so registration cannot retroactively capture all required chunks.

Acceptance:

- the build produces a versioned precache manifest for the exact promoted artifact;
- navigation fallback never substitutes HTML for module, worker, data, or manifest requests;
- a cold browser can visit once, close, go offline, reopen, solve, and reload;
- construction readiness separately proves that required lexicon and worker assets are cached;
- upgrade testing covers old shell plus new shell plus preserved model assets.

## PO-P0-3: hydration can overwrite early interaction

Evidence:

- `apps/web/src/App.tsx:68-73` creates and renders a fresh interactive session;
- `apps/web/src/App.tsx:132-142` asynchronously loads a persisted session and then replaces current state.

If the user types before IndexedDB resolves, the loaded snapshot can erase the keystroke.

Choose and document one boot contract:

- keep the puzzle non-editable until hydration resolves, with a brief accessible loading state; or
- merge against a revisioned local draft using deterministic conflict rules.

For a single local session, an explicit hydration gate is simpler and more honest.

Acceptance:

- a deferred repository-load test types before resolution and proves no input is lost;
- loading, no saved session, invalid saved session, and repository failure have distinct outcomes;
- focus is placed only after the interactive session is authoritative.

## PO-P1-1: writes can complete out of order or be lost at lifecycle edges

The App debounces session saves and starts asynchronous flushes during page-hide/visibility events. The repository performs unconditional puts. A slow earlier write can complete after a newer write, and browser shutdown does not guarantee the final asynchronous operation finishes.

Acceptance:

- one write coordinator serializes snapshots by monotonic revision;
- an older completion can never replace a newer committed revision;
- lifecycle flushing is best-effort backup, not the only correctness mechanism;
- tests control write resolution order and assert the newest revision wins.

## PO-P1-2: multiple tabs are last-writer-wins without a stated policy

Snapshots carry revision information, but `packages/persistence/src/sessionRepository.ts` writes without compare-and-swap, locking, or peer notification. Two open tabs can silently replace each other.

The product must either:

1. declare and enforce single-writer ownership using `navigator.locks` plus a visible read-only secondary tab; or
2. implement revision conflict detection and an explicit conflict UX.

Do not add an invisible last-writer-wins merge.

Acceptance:

- two-tab behavior is documented and browser-tested;
- a stale writer cannot silently overwrite the authoritative revision;
- the user can recover or export both sides if a conflict is detected.

## PO-P1-3: schema ownership is duplicated

Database name, version, store creation, and open logic are repeated across repository files. There is no common handling for `blocked` or `versionchange`. Multiple long-lived connections can obstruct a future migration.

Acceptance:

- one database module owns versioning and migrations;
- connections close on version change;
- blocked upgrades produce a user-actionable state;
- migrations are fixture-tested from every supported prior version.

## PO-P1-4: archive validation lacks referential integrity

Continuity import validates record shapes but not the whole graph. It needs to detect duplicate IDs, invalid session-to-puzzle references, incompatible cells/entries, duplicate event IDs, and malformed provenance relationships across all records.

`apps/web/src/App.tsx:409-418` validates the currently selected session before replacement, but other shape-valid records may still be stored.

Acceptance:

- validation is pure and runs before opening a write transaction;
- all cross-record invariants are enumerated and tested;
- one invalid record rejects the archive without changing existing data;
- error output names a stable path and code without echoing sensitive content.

## PO-P1-5: import is destructive but export is partial

The current export includes the current puzzle and session and an empty profile collection. Repository `replace` clears all continuity stores before importing. A user can therefore replace a larger local library with a one-puzzle archive while believing they are restoring or adding a puzzle.

Required product decision:

- **replace all:** full backup only, with counts, preview, typed confirmation, and rollback-safe transaction;
- **merge:** collision policy by stable ID/revision, with a preview and conflict report;
- optionally **import one puzzle:** a distinct operation that never clears unrelated records.

Acceptance:

- operation copy says exactly what will be removed or retained;
- preview shows record counts and format version;
- cancellation writes nothing;
- transaction failure retains the prior database;
- full export actually includes every supported store.

## PO-P1-6: solved-day continuity is split into local storage

The solved list is read and written separately in `apps/web/src/App.tsx:122-129` and `:173-192`. It is not part of the IndexedDB archive contract. A restore can therefore recover a solved session without its day history, or vice versa.

Acceptance:

- one persistence boundary owns solved-day metadata;
- archive/export/reset semantics include it explicitly;
- migration preserves existing local-storage users and removes the legacy key only after a verified write.

## PO-P1-7: published constructed puzzles are not reopenable

The App publishes a constructed puzzle and tolerates persistence failure, but startup still creates the initial fixture and does not load the saved puzzle library. The persistence comment promises survival across reload without an application path to rediscover the puzzle.

Acceptance:

- publish is acknowledged only after durable storage succeeds;
- startup and library flows enumerate saved puzzles;
- the active session points to a durable puzzle ID;
- a browser journey constructs, publishes, reloads, and reopens the same puzzle.

## PO-P1-8: service-worker updates are not surfaced

`apps/web/src/main.tsx` dispatches `crossword-sw-update`, but no application listener consumes it. The user is never told that a new exact artifact is waiting, nor given a safe refresh path.

Acceptance:

- update availability appears as non-blocking, accessible UI;
- refresh waits for pending durable writes;
- a new worker takes control through an explicit tested handshake;
- repeated events do not create repeated notices.

## PO-P1-9: model readiness is not construction-offline readiness

The UI can imply that a ready model makes construction available offline. Construction lexicons are fetched lazily in `apps/web/src/App.tsx:645-649` and `apps/web/src/constructionClient.ts:20-34`, and they are not in the current shell cache.

Acceptance:

- readiness is a conjunction of model, constructor worker, lexicon assets, and usable storage;
- settings shows which dependency is missing and its approximate size;
- an offline construction test starts from the exact readiness receipt.

## Implementation sequence

1. Write a storage ownership table covering every IndexedDB store, local-storage key, CacheStorage prefix, and model asset.
2. Add the service-worker ownership red test and stop broad cache deletion.
3. Define hydration and single-writer/multi-tab semantics.
4. Centralize database opening and migration.
5. Serialize revisioned writes.
6. Specify full-replace, merge, and single-puzzle archive operations.
7. Generate a build-owned precache manifest.
8. Integrate boot, update, import-preview, and library UI through one App owner.
9. Prove cold-install and upgrade offline journeys in a real browser.

## Ownership boundary

The persistence architect owns `packages/persistence` and its contract tests. The PWA owner owns `apps/web/public/sw.js`, registration, cache-manifest generation, and offline tests. The App integrator later owns hydration UI, update UI, library selection, and import preview. Do not let three agents simultaneously edit `App.tsx`.

## Verification gate

```sh
npm run test --workspace @crossword/persistence
npm run test --workspace @crossword/web
npm run web:build
npm run web:e2e
make qa
```

The browser gate must include both a first-install offline run and an old-to-new worker activation with seeded foreign caches.

## Closure evidence

Contract: ADR 0005 (`docs/adr/0005-persistence-ownership.md`) — database ownership, monotonic write serialization, conflict detection, graph-wide archive validation, replace/merge/import-one semantics, solved-day boundary. ADR 0006 (`docs/adr/0006-cache-ownership.md`) — CacheStorage ownership table and precache manifest.

Closed:

- **PO-P0-1** — activation deletes only obsolete `crossword-shell-v*` caches; speech (`transformers-cache`), WebLLM, and foreign caches survive. Test: `apps/web/src/sw.test.ts` (`activation deletes only obsolete shell caches it owns`). Commit `PWA-2C`.
- **PO-P0-2** (build artifact) — `apps/web/scripts/generate-sw-precache.mjs` injects the exact Vite build manifest (hashed scripts, styles, worker chunks, lexicon data, boot assets) into `dist/sw.js`; navigation fallback serves cached HTML only for `mode === 'navigate'`; a missing module offline fails as a network error instead of HTML. Tests: `sw.test.ts` (`install precaches the injected manifest…`, `never answers a missing module request…`, `answers navigation requests from the cached shell…`), `generate-sw-precache.test.mjs`. Commit `PWA-2C`.
- **PO-P1-1** — `trySave` serializes per-puzzle writes by monotonic revision; an older asynchronous completion is refused (`stale-write`) and cannot beat a newer committed revision; the transaction re-checks stored revisions. Tests: `sessionWrites.test.ts` (`commits increasing revisions…`, `never lets an older asynchronous write beat a newer committed revision`, `treats an equal-revision re-save…`). Commit `PERSIST-2AB`.
- **PO-P1-3** — `packages/persistence/src/database.ts` is the single owner of name/version/stores/migrations; `versionchange` closes the connection; `blocked` is surfaced via callback; v1→v3 migration tested. Tests: `database.test.ts` (4 tests). Commit `PERSIST-2AB`.
- **PO-P1-4** — `validateArchiveGraph` (pure, pre-transaction) enumerates duplicate puzzle ids, duplicate session ids, missing puzzle references, unknown cell references, and duplicate event ids with stable `path code` errors; one invalid record rejects the archive. Tests: `continuityOperations.test.ts` (5 graph tests). Commit `PERSIST-2AB`.
- **PO-P1-5** — `replace` (atomic full restore), `merge` (additive, existing records win id collisions, newest-revision-wins sessions, preferences/profiles untouched, typed report), `importOne` (one named puzzle + its session, typed failure when missing) are separate named operations; `previewContinuityExport` reports counts/version. Tests: `continuityOperations.test.ts` (merge/import/missing-puzzle). Commit `PERSIST-2AB`.
- **PO-P1-6** (persistence boundary) — `solvedDays` joins the archive format (additive, optional, validated) and is stored/restored by replace/export. Test: `continuityOperations.test.ts` (`round-trips solved-day metadata…`). Commit `PERSIST-2AB`.

DECISION REQUIRED (PO-P1-2 full policy): conflict detection (newest-revision-wins with typed `conflict` result) is implemented as the shared safety floor. Choosing between (a) `navigator.locks` single-writer with a visible read-only secondary tab and (b) a full conflict UX with per-side export remains an owner decision; invisible last-writer-wins stays forbidden.

Still open for Increment 6 (App integrator): PO-P0-3 hydration gate UI, PO-P1-7 puzzle library reopen, PO-P1-8 update-ready UI consuming `crossword-sw-update` with pending-write flush, PO-P1-9 construction-offline readiness receipt, legacy localStorage solved-day migration, archive preview/merge/replace UI. Cold-first-install and old-to-new upgrade Playwright journeys remain to be authored against the settled worker.

Verification: `npm --workspace @crossword/persistence run test` — 26 passed; `npm --workspace @crossword/web run test` — 77 passed; `npm run web:build` (with precache injection) — green; pre-commit full gate passed for commits `05c3f7e` (persistence) and `eb4fa9f` (PWA).

### App integration checkpoint — 2026-09-05

The current App now gates editing until hydration completes, reopens the last
durably published local-construction puzzle by ID, and consumes the service-
worker update event with a save-before-refresh action. Full cold-install,
upgrade, multi-tab conflict, and archive-preview journeys remain separate
release evidence or owner-policy work.
