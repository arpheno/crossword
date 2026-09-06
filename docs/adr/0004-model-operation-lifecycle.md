# ADR 0004: model operation lifecycle and ownership

Date: 2026-09-04

Status: accepted for the runtime increment (FULL_REVIEW_PASS_2026-09-04_01_RUNTIME_ORCHESTRATION.md)

## Context

The model runtime spans a browser client (`apps/web/src/workers/modelClient.ts`), a
broker worker (`apps/web/src/workers/modelWorker.ts`), the broker state machine
(`packages/model-runtime/src/broker.ts`), and the WebLLM adapter. Progress was
unscoped: the protocol carried `requestId`, but the client dropped it, so every
consumer observed one global progress stream and a completed generation could
leave the UI stuck on `generating`. Two prepares could both enter installation,
`install`/`load` did not match the adapter's real atomic behavior, unload
violated the typed-result convention, and nested engine workers leaked.

## Decisions

### 1. Resource states are the source of truth

Two independent resource facts exist for the pinned model on a browser profile:

- **cache** — model weights in browser CacheStorage (`absent` / `present`);
- **residency** — a live nested engine worker plus WebLLM engine (`none` / `engine`).

The broker state derives from them:

| Broker state | Cache | Residency | Meaning |
| --- | --- | --- | --- |
| `uninstalled` | absent | none | nothing downloaded |
| `installed` | present | none | downloaded, not resident (reachable only via `unload`) |
| `loaded` | present | engine, idle | ready for generation |
| `generating` | present | engine, busy | a generation operation is running |
| `unloading` | present | engine, tearing down | transient |

### 2. `install` is an atomic prepare

The WebLLM runtime offers no download-only API: `CreateWebWorkerMLCEngine`
downloads weights and creates the resident engine in one awaited call.
Preserving a fictional two-step state machine (install = cache-only) would
report `installed` while a GPU engine is resident. Therefore **a successful
`install` leaves the broker `loaded`** (cache present AND engine resident).
`load` on a resident engine is a typed no-op success. `unload` releases the
engine and terminates the nested worker, leaving cache present (`installed`).
Cancellation is an adapter boundary responsibility: the adapter disposes a
partially or just-completed creation when its signal aborts and surfaces the
cancellation as a thrown error; the broker treats a resolved `install` as
success (the engine genuinely is resident) and a thrown cancellation as
`cancelled` with state still `uninstalled`.

### 3. Operations carry identity end to end

Every command has an operation identity: `requestId` (client-generated,
preserved through worker protocol responses), `kind` (`install`, `load`,
`generate-candidates`, `resolve-spoken-answer`, `compose-clues`, `unload`,
`delete-cache`, `inspect-cache`), and a status. The client exposes
`subscribeOperations` with explicit events:

- start (`status: 'running'`) when the command is submitted;
- progress updates, each tagged with `requestId` and `kind`;
- exactly one terminal event (`succeeded` / `cancelled` / `failed`).

Events for settled or unknown request IDs are dropped, so a stale event from
operation A can never mutate operation B. Consumers filter by the request IDs
of the operations they own. `subscribeProgress` remains only as a deprecated
bridge for the pre-existing controller and is removed when the App integrator
migrates (Increment 6).

### 4. The model worker is a strict single-command arbiter

WebLLM is a scarce single-engine resource. The worker serializes commands FIFO:
one job runs at a time; later commands queue. Cancelling a queued job settles it
immediately as `cancelled` without running it. Cancelling a running job aborts
its `AbortSignal`; the broker maps that to a `cancelled` result. Duplicate
request IDs are rejected. The broker keeps its own `busy` guards as defense in
depth.

### 5. Typed failures everywhere

Every broker command resolves with `BrokerResult` — including `unload`, which
previously rethrew. After a failed unload the residency is not provably
released, so the state stays conservatively `loaded` and the failure is
reported. Client-side fatal conditions (`worker-fatal`, disposed client,
forced hard cancellation) reject with `ModelClientError` carrying a `code`.
Cancelled and failed remain distinct statuses.

### 6. Bounded cancellation with hard worker replacement

Cooperative cancellation posts a cancel message and waits a bounded grace
period (default 8 s). If the worker has not settled the operation by then, the
client terminates the worker, rejects the target operation as cancelled, other
pending operations as `worker-fatal`, emits terminal events, and notifies its
owner via `onFatal`. Recovery constructs a fresh client and worker (controller
responsibility in Increment 6); no promise, timer, or listener is reused.

### 7. Honest storage preflight

`ModelManifest.estimatedBytes` is an optional conservative byte estimate used
when shard receipts are absent (the WebLLM pin delegates integrity to the
runtime manifest). The storage preflight requires headroom of
`max(sum(shard bytes), estimatedBytes)`. The UI must label the number an
estimate and must distinguish unknown quota from sufficient quota.

### 8. Adapter teardown is idempotent and leak-free

Adapter teardown calls engine `unload()` and terminates the nested worker
exactly once per engine, including fatal setup and cancellation paths.
Repeated prepare/unload cycles do not increase live workers. An abort during
engine creation terminates the worker created for that attempt (identity-
captured), never an engine owned by a successor.

## Consequences

- The controller/UI (Increment 6) migrates to `subscribeOperations` and
  request-scoped leases; until then the deprecated unscoped progress bridge
  keeps the current UI compiling.
- `install` returning `loaded` supersedes the old expectation that install
  leaves `installed`; existing callers that install-then-load keep working.
- Protocol version stays `1`; `estimatedBytes` is optional and validated.
