# ADR 0005: persistence ownership, write ordering, and archive operations

Date: 2026-09-04

Status: accepted for the persistence increment (FULL_REVIEW_PASS_2026-09-04_02_PERSISTENCE_OFFLINE.md)

## Scope

Covers the IndexedDB continuity stores (`crossword` database), the continuity
archive format, and the write-ordering contract. CacheStorage ownership (shell,
speech, WebLLM) is decided in ADR 0006 with the PWA increment.

## Decisions

### 1. One database module owns name, version, stores, and migrations

`packages/persistence/src/database.ts` is the single owner of the database
name, schema version, object-store creation, and upgrade migrations. Duplicate
`openDatabase` copies in the repositories are removed. `versionchange` closes
the connection promptly so a future migration is never blocked by this
process; `blocked` is surfaced through an optional callback so the application
can present a user-actionable state. Migrations are tested from every supported
prior version (v1 legacy single-store, v2, v3).

### 2. Session writes are serialized by monotonic revision

`trySave` (new repository method) serializes per-puzzle writes and refuses:

- a snapshot whose revision is lower than the last committed revision for that
  puzzle (`stale-write`) — an older asynchronous completion can never beat a
  newer committed revision;
- a snapshot whose revision is lower than the revision currently stored by
  another connection (`conflict`) — a stale writer cannot silently overwrite
  the authoritative revision.

Equal-revision saves are idempotent re-writes of the same operation. The
legacy `save` keeps its throw-on-invalid behavior for existing callers; the
App migrates to `trySave` in Increment 6.

### 3. Multi-tab policy: conflict detection now, product policy open

This ADR implements the shared safety floor both candidate policies need
(newest-revision-wins with an explicit typed conflict result). Choosing between
a navigator.locks single-writer read-only secondary tab and a full conflict UX
is a product decision recorded as **DECISION REQUIRED** in the review file.
Invisible last-writer-wins remains forbidden.

### 4. Archive validation is graph-wide and pure

`validateArchiveGraph` runs before any write transaction and enumerates:
duplicate puzzle ids, duplicate session puzzle ids, sessions referencing
missing puzzles, session/event cell and entry references missing from the
referenced puzzle, and duplicate event ids. Issues carry a stable path and
code and never echo entry content. One invalid record rejects the whole
archive without changing existing data.

### 5. Replace, merge, and import-one are separate named operations

- `replace` — full backup restore; clears all continuity stores inside one
  transaction (atomic; failure retains the prior database);
- `merge` — additive; on id collision the existing record is kept and counted
  (published puzzles are immutable), sessions follow newest-revision-wins;
  preferences and profiles are never touched by merge;
- `importOne` — inserts one named puzzle with its session and its events;
  never clears unrelated records; missing puzzle is a typed failure.

`previewContinuityExport` reports counts and format version; `mergePreview`
reports what a merge would change before anything is written.

### 6. Solved-day metadata joins the archive boundary

`solvedDays` (ordered day strings) is an additive, optional archive field
(schemaVersion stays 1; absent means empty). Replace restores it, merge keeps
existing days, and it is stored in the preferences store as its own record so
export/reset semantics include it explicitly. Migration of the legacy
localStorage key happens at the App boundary in Increment 6 and only after a
verified write.
