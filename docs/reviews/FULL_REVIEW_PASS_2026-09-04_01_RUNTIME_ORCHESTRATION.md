# Full review increment 01: model runtime orchestration

Date: 2026-09-04

Priority: first implementation increment

Reasoning tier: superintelligence for contract design; Luna only after the transition table is fixed

## Outcome

The settings UI cannot accurately explain model download, load, generation, unload, and deletion yet because the runtime has no reliable owner-scoped operation state. The current stack combines broker state, unscoped progress, and UI phase into one snapshot. Several interleavings can produce a permanently false status or mismatched resource state.

Do not patch the dialogue first. Define one lifecycle contract spanning adapter, broker, worker protocol, browser client, controller, and settings presentation.

## Current path

```text
settings / construction / speech
        -> localModelController
        -> modelClient
        -> modelWorker
        -> LocalModelBroker
        -> WebLLM adapter
        -> nested engine worker + CacheStorage
```

The protocol already places a `requestId` on responses, but the client drops it before progress reaches the controller. That is the central design break.

## RTO-P0-1: successful generation can leave the phase stuck

Evidence:

- `apps/web/src/localModelController.ts:121-139` maps every progress event into the shared controller phase.
- Its state subscriber deliberately avoids changing to `ready` while the current phase is `generating`, `unloading`, or `deleting-cache`.
- `apps/web/src/workers/modelWorker.ts:67-78` sends generation progress, then a loaded broker state, but no terminal progress event that repairs the UI phase.

Reproduction to encode as a red test:

1. configure an installed model;
2. perform a generation request that emits `generating` progress;
3. resolve it successfully and emit broker state `loaded`;
4. assert that the controller returns to a terminal `ready` state.

Current expected failure: the phase remains `generating`.

Acceptance:

- every command has explicit start, terminal success, terminal cancellation, and terminal failure events;
- terminal broker state and active operation cannot disagree;
- settings does not display a completed generation as ongoing;
- the test covers success, failure, and cancellation.

## RTO-P0-2: progress ownership is discarded

Evidence:

- `packages/model-runtime/src/workerProtocol.ts` carries `requestId` in worker responses;
- `apps/web/src/workers/modelClient.ts:79-81` notifies listeners with only `message.progress`;
- the controller consequently exposes one global progress stream to all consumers.

Construction, voice interpretation, initial install, model load, unload, and cache deletion can overwrite the same settings snapshot. A percentage only has meaning when paired with its operation, model, and owner.

Required contract:

```ts
type ModelOperation = {
  id: string;
  kind: 'install' | 'load' | 'generate' | 'unload' | 'delete-cache';
  owner: 'settings' | 'construction' | 'voice' | string;
  modelId: string;
  phase: string;
  status: 'queued' | 'running' | 'succeeded' | 'cancelled' | 'failed';
  progress?: { completed: number; total?: number; unit?: string };
  error?: ModelRuntimeError;
};
```

The exact shape is a design task, not a mandated patch. Preserve `requestId` end to end and decide whether consumers observe all operations or only their lease.

Acceptance:

- two consumers can issue work without presenting each other's progress;
- a stale event from operation A cannot regress operation B;
- the settings surface distinguishes cached, resident, busy, failed, and unavailable;
- tests use two owners and intentionally reorder messages.

## RTO-P0-3: commands are not serialized

Evidence:

- `apps/web/src/localModelController.ts:179-228` aborts an existing prepare and starts another immediately;
- `apps/web/src/workers/modelWorker.ts:53-81` rejects duplicate request IDs, not concurrent model jobs;
- broker install state remains `uninstalled` until the adapter returns;
- `packages/model-runtime/src/webllmAdapter.ts:230-267` manages one mutable `engineWorker`.

Two prepare calls can both enter installation. Cancellation of an older call can race with initialization of a newer nested worker.

Required decision:

- either the worker is a strict single-command arbiter with a queue and generation lease;
- or concurrent commands have explicitly safe adapter semantics.

WebLLM is effectively a scarce single-engine resource, so a serialized arbiter is the safer default.

Acceptance:

- simultaneous prepare calls create at most one engine;
- a superseded request cannot terminate the engine owned by its successor;
- cache deletion waits for or cancels generation according to an explicit rule;
- command order is covered with controllable deferred promises.

## RTO-P0-4: install and load do not match the adapter's real states

Evidence:

- `packages/model-runtime/src/broker.ts:218-251` treats install and load as distinct cache and residency transitions;
- `packages/model-runtime/src/webllmAdapter.ts:293-304` creates and loads the engine during `install`;
- adapter `load` is effectively a no-op while that engine exists.

A failure or cancellation between broker install and load can report `installed` while a GPU engine remains resident. Broker `unload` and cache deletion then act from a false state.

Design one of these models:

1. one atomic `prepare` operation whose real result is both cached and resident; or
2. a genuine download-only adapter followed by a separate engine creation step.

Do not preserve a fictional two-step state machine merely because the interface already names two methods.

Acceptance:

- state is derived from actual resource ownership;
- cancellation at every awaited boundary leaves a known cache and residency state;
- delete-cache cannot run against an undisposed engine;
- install/load/unload/delete sequences are table-tested.

## RTO-P1-1: unload failure violates the result contract

`packages/model-runtime/src/broker.ts` resets state and rethrows when adapter unload fails. Other broker operations return a typed failure. `apps/web/src/localModelController.ts` and the App unload handler do not consistently catch that throw.

Acceptance:

- choose typed-result or throwing semantics for every broker command;
- callers handle failure without an unhandled rejection;
- resource state after a failed unload is explicitly `unknown`, `loaded`, or `unloaded`, based on evidence rather than optimism.

## RTO-P1-2: nested engine workers can leak

`packages/model-runtime/src/webllmAdapter.ts:317-323` calls `unload()` and drops the `engineWorker` reference. The installed WebLLM implementation's `unload()` posts an unload command but does not terminate the underlying browser worker.

Acceptance:

- adapter teardown calls the appropriate unload and worker termination operations exactly once;
- repeated prepare/unload cycles do not increase live worker count;
- tests spy on both engine unload and raw worker termination;
- fatal setup and cancellation paths use the same idempotent teardown.

## RTO-P1-3: a fatal worker error is not recoverable

`apps/web/src/workers/modelClient.ts` rejects pending requests on worker error but does not recreate or terminate the failed worker. The controller remains configured and continues to reference the dead client.

Acceptance:

- a fatal worker error moves the controller to a recoverable failed state;
- a subsequent user retry constructs a fresh worker and resubscribes once;
- pending operations fail with operation IDs and actionable error codes;
- no event from the dead worker mutates the fresh controller.

## RTO-P1-4: storage preflight checks zero bytes

`apps/web/src/modelConfig.ts` supplies an empty shard list. The broker derives required storage from shard sizes, so the nominal storage check cannot reject insufficient quota. The UI tells the user it is checking storage without having a useful byte estimate.

Acceptance:

- a pinned manifest carries a conservative byte estimate or verified asset receipt;
- the UI labels an estimate as an estimate;
- unknown quota remains distinct from sufficient quota;
- low-space and unavailable-estimate paths are tested.

## RTO-P1-5: cancellation has no hard deadline

`apps/web/src/workers/modelClient.ts:100-118` sends cancel and waits for a terminal worker response. If initialization or an underlying library hangs, there is no deadline or worker replacement. The speech client already demonstrates a harder cancellation pattern worth comparing.

Acceptance:

- cooperative cancellation has a bounded grace period;
- timeout forces idempotent worker replacement;
- the replacement does not reuse stale promises or listeners;
- the UI distinguishes cancelled from failed.

## Implementation sequence

1. Write a transition table for cache, residency, active command, and user-visible phase.
2. Add red protocol tests for request-scoped progress and reordered events.
3. Add adapter resource-ownership tests with deferred initialization and teardown spies.
4. Make the worker a single authority for command serialization.
5. Preserve operation identity through `modelClient` and the controller.
6. Integrate the settled snapshot into settings, construction, and voice.
7. Add a fake-worker E2E journey for install, generate, unload, retry, and delete.
8. Add an opt-in live WebGPU smoke; do not make fake-worker success the only release evidence.

## Ownership boundary

The runtime architect owns:

- `packages/model-runtime/src/broker.ts`;
- `packages/model-runtime/src/webllmAdapter.ts`;
- `packages/model-runtime/src/workerProtocol.ts`;
- `apps/web/src/workers/modelWorker.ts`;
- `apps/web/src/workers/modelClient.ts`;
- their direct tests.

The later App integrator owns `apps/web/src/localModelController.ts`, settings copy, and `App.tsx`. Do not edit `App.tsx` in the runtime-contract change.

## Verification gate

Run at minimum:

```sh
npm run test --workspace @crossword/model-runtime
npm run test --workspace @crossword/web
npm run web:build
make qa
```

Add a closure entry here with the transition-table version, commit, and exact test names.

## Closure evidence

Contract: ADR 0004 (`docs/adr/0004-model-operation-lifecycle.md`) — transition table over cache/residency/broker state, atomic-prepare decision, single-command worker arbiter, request-scoped operation events, typed failures, bounded cancellation, honest storage preflight, idempotent adapter teardown.

Closed by this increment (runtime boundary):

- **RTO-P0-2** — `requestId` is preserved end to end; the client emits start/progress/terminal events scoped by `requestId` and operation kind, drops stale events, and keeps two owners isolated. Tests: `apps/web/src/workers/modelClient.operations.test.ts` (`emits start, request-scoped progress…`, `keeps two owners isolated…`, `drops progress for settled requestIds`). Commit `bc56978`.
- **RTO-P0-3** — the model worker is a single-command FIFO arbiter (`apps/web/src/workers/modelJobQueue.ts`); queued cancels settle without running; duplicate IDs rejected; the broker joins an in-flight prepare and the adapter refuses a second engine. Tests: `modelJobQueue.test.ts`, `broker.lifecycle.test.ts` (`creates at most one engine under overlapping prepares`, `refuses install while a generation owns the engine`). Commits `8a32e52`, `bc56978`.
- **RTO-P0-4** — install is an atomic prepare (WebLLM has no download-only API): success leaves the broker `loaded` (cached AND resident); `installed` means cached-not-resident after unload. Tests: `broker.lifecycle.test.ts` (`reports a resident engine after atomic prepare install`), `webllmAdapter.ownership.test.ts`, `broker.edge.test.ts` (fixtures aligned with ADR §2).
- **RTO-P1-1** — `unload` returns a typed `runtime-error` failure and keeps conservative `loaded` residency. Test: `broker.edge.test.ts` (`keeps the broker usable when unload fails`). Commit `8a32e52`.
- **RTO-P1-2** — adapter teardown unloads the engine and terminates the nested worker exactly once; repeated prepare/unload cycles keep live workers flat; aborted attempts dispose via identity-keyed late rescue. Tests: `webllmAdapter.ownership.test.ts` (`terminates the nested engine worker exactly once on unload`, `keeps live worker count flat…`, `rejects promptly, disposes the attempt…`, `disposes a just-created resident engine…`). Commit `8a32e52`.
- **RTO-P1-3** — a fatal worker error rejects pending operations with `ModelClientError('worker-fatal')`, emits terminal `failed` events, notifies `onFatal`, and refuses further commands until a fresh client is constructed. Test: `modelClient.operations.test.ts` (`fails pending operations with typed codes…`). Commit `bc56978`.
- **RTO-P1-4** — `ModelManifest.estimatedBytes` (validated in broker + protocol) feeds the storage preflight; the pin carries a conservative 1.2 GB estimate. Tests: `broker.lifecycle.test.ts` (`preflights storage against the manifest byte estimate…`), `workerProtocol.test.ts` (`accepts a positive integer byte estimate…`). Commits `8a32e52`, `bc56978`.
- **RTO-P1-5** — cooperative cancellation gets a bounded grace (default 8 s) after which the client terminates the worker, rejects the target as `cancelled`, others as `worker-fatal`, and notifies `onFatal`. Tests: `modelClient.operations.test.ts` (`forces worker replacement after the cooperative grace period`, `does not force replacement when the worker settles inside the grace period`). Commit `bc56978`.

Deliberate test-contract changes mandated by the ADR (not weakenings): `broker.edge.test.ts` cancellation-after-adapter fixture now mirrors the real adapter boundary (dispose + throw), and the unload-failure test expects the typed result per RTO-P1-1.

Still open for Increment 6 (App/settings integrator): controller/UI consumption of `subscribeOperations` (RTO-P0-1 acceptance — no permanent `generating` after success, cached/resident/busy/failed/unavailable distinctions), fresh-client rebuild on `onFatal`, and estimate labeling. `subscribeProgress` remains as a deprecated bridge until that migration.

Verification: `npm --workspace @crossword/model-runtime run test` — 41 passed; `npm --workspace @crossword/web run test` — 68 passed; `npm run web:build` — green; full pre-commit gate (make test, build, content scan, coverage, Playwright) passed for commits `8a32e52` and `bc56978`.
