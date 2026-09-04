# ADR 0006: CacheStorage ownership table

Date: 2026-09-04

Status: accepted for the PWA increment (PO-P0-1, PO-P0-2)

CacheStorage is shared per origin. Every cache-owning subsystem has one
prefix, one owner, and one cleanup path. The service worker's activation may
delete **only** obsolete caches under its own shell prefix — never model,
speech, or foreign caches.

| Cache | Prefix / name | Owner | Created by | Deleted by |
| --- | --- | --- | --- | --- |
| Application shell | `crossword-shell-v<N>` (current: `crossword-shell-v4`) | `apps/web/public/sw.js` | service-worker install | service-worker activation (obsolete versions only) |
| Speech models | `transformers-cache` | `apps/web/src/speechCache.ts` | speech download runtime | speech settings action only (`deleteSpeechModelCache`) |
| LLM weights | `webllm/model` scope (WebLLM runtime) | `@mlc-ai/web-llm` via `packages/model-runtime` adapter | engine download at prepare | model settings action only (broker `deleteCache`) |
| Anything else | * | foreign | * | never touched by this product |

## Precache manifest

The service worker precaches the exact promoted artifact: a build step
(`apps/web/scripts/generate-sw-precache.mjs`) reads the Vite build manifest
and injects every emitted entry plus the boot assets into the built
`dist/sw.js` (`self.__CROSSWORD_PRECACHE__`). One successful visit therefore
establishes a complete offline boot: hashed scripts, styles, worker chunks,
lexicon data files, and the navigation fallback.

## Navigation fallback rule

The cached `/index.html` document is returned **only** for navigation
requests. A missing module, worker, data file, or manifest request must fail
as a network failure offline; substituting HTML would poison module parsing.

## Update handshake

A waiting worker is activated through the existing `SKIP_WAITING` message;
the application is told via the `crossword-sw-update` DOM event (consumed by
the App in Increment 6, which must flush durable writes before reloading).
