import { describe, expect, it, vi } from 'vitest';
import { createModelBroker, type LocalModelAdapter, type ModelManifest, type RuntimeProbe } from './broker';

const manifest: ModelManifest = {
  schemaVersion: 1,
  id: 'lifecycle-model',
  version: 'q4',
  quantization: 'Q4_K_M',
  runtimeVersion: 'fixture',
  promptVersion: 'fixture',
  minimumMemoryMb: 1,
  shards: []
};

const runtime: RuntimeProbe = {
  webgpu: true,
  availableMemoryMb: 2,
  storageQuotaBytes: 10,
  storageUsageBytes: 0
};

const request = {
  seed: 'lifecycle',
  audienceSummary: 'broad',
  requestedRoles: ['general'] as const,
  excludedAnswers: [],
  maxSuggestions: 2
};

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function baseAdapter(): LocalModelAdapter {
  return {
    install: vi.fn(async () => undefined),
    load: vi.fn(async () => undefined),
    generateCandidates: vi.fn(async () => []),
    resolveSpokenAnswer: vi.fn(async () => []),
    composeClues: vi.fn(async () => [{ mechanism: 'direct' as const, text: 'A clue', difficulty: 0.2 }]),
    unload: vi.fn(async () => undefined)
  };
}

// ADR 0004 §2: the WebLLM prepare is atomic. A resolved install means the
// engine is resident, so the broker must report `loaded`, not `installed`.
describe('broker operation lifecycle (ADR 0004)', () => {
  it('reports a resident engine after atomic prepare install', async () => {
    const modelAdapter = baseAdapter();
    const broker = createModelBroker(manifest, modelAdapter, runtime);

    const result = await broker.install();

    expect(result.ok).toBe(true);
    expect(broker.state()).toBe('loaded');
  });

  it('creates at most one engine under overlapping prepares', async () => {
    const gate = deferred<void>();
    const install = vi.fn(async () => gate.promise);
    const broker = createModelBroker(manifest, { ...baseAdapter(), install }, runtime);

    const first = broker.install();
    const second = broker.install();
    gate.resolve(undefined);
    await Promise.all([first, second]);

    expect(install).toHaveBeenCalledTimes(1);
    expect(broker.state()).toBe('loaded');
  });

  it('refuses install while a generation owns the engine', async () => {
    const gate = deferred<unknown[]>();
    const broker = createModelBroker(manifest, { ...baseAdapter(), generateCandidates: vi.fn(async () => gate.promise) }, runtime);
    await broker.install();

    const generation = broker.generateCandidates(request);
    const busy = await broker.install();

    expect(busy).toEqual({ ok: false, error: { code: 'busy', message: 'The local model is busy' } });
    gate.resolve([]);
    await generation;
    expect(broker.state()).toBe('loaded');
  });

  it('returns to a terminal loaded state after success, failure, and cancellation', async () => {
    const failing = createModelBroker(manifest, { ...baseAdapter(), generateCandidates: vi.fn(async () => [{ surface: 'CAT' }]) }, runtime);
    await failing.install();
    await failing.generateCandidates(request);
    expect(failing.state()).toBe('loaded');

    const controller = new AbortController();
    const hanging = deferred<unknown[]>();
    const cancelling = createModelBroker(manifest, {
      ...baseAdapter(),
      generateCandidates: vi.fn(async () => hanging.promise)
    }, runtime);
    await cancelling.install();
    const pending = cancelling.generateCandidates(request, controller.signal);
    controller.abort();
    hanging.reject(new Error('Local model operation cancelled'));
    await expect(pending).resolves.toEqual({ ok: false, error: { code: 'cancelled', message: 'Candidate generation cancelled' } });
    expect(cancelling.state()).toBe('loaded');
  });

  it('returns a typed failure for a failed unload and keeps conservative residency', async () => {
    const broker = createModelBroker(manifest, { ...baseAdapter(), unload: vi.fn(async () => { throw new Error('device lost'); }) }, runtime);
    await broker.install();

    const result = await broker.unload();

    expect(result).toEqual({ ok: false, error: { code: 'runtime-error', message: 'device lost' } });
    expect(broker.state()).toBe('loaded');
  });

  it('derives residency honestly when the adapter throws a late cancellation', async () => {
    const controller = new AbortController();
    const install = vi.fn(async () => {
      controller.abort();
      throw new Error('Local model operation cancelled');
    });
    const broker = createModelBroker(manifest, { ...baseAdapter(), install }, runtime);

    const result = await broker.install(controller.signal);

    expect(result).toEqual({ ok: false, error: { code: 'cancelled', message: 'Model installation cancelled' } });
    expect(broker.state()).toBe('uninstalled');
  });

  it('unloads idempotently and keeps the cache after unload', async () => {
    const unload = vi.fn(async () => undefined);
    const broker = createModelBroker(manifest, { ...baseAdapter(), unload }, runtime);
    await broker.install();

    const first = await broker.unload();
    const second = await broker.unload();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(unload).toHaveBeenCalledTimes(1);
    expect(broker.state()).toBe('installed');
  });

  it('preflights storage against the manifest byte estimate, not a zero-byte shard list', async () => {
    const estimate = 1_200_000_000;
    const pin: ModelManifest = { ...manifest, estimatedBytes: estimate };
    const tight: RuntimeProbe = { webgpu: true, availableMemoryMb: 2, storageQuotaBytes: estimate, storageUsageBytes: estimate - 1 };
    const ample: RuntimeProbe = { webgpu: true, availableMemoryMb: 2, storageQuotaBytes: estimate + 1, storageUsageBytes: 0 };

    const blocked = await createModelBroker(pin, baseAdapter(), tight).install();
    expect(blocked).toEqual({ ok: false, error: { code: 'storage-quota', message: 'There is not enough local storage for the pinned model' } });

    const allowed = await createModelBroker(pin, baseAdapter(), ample).install();
    expect(allowed.ok).toBe(true);
  });

  it('keeps delete-cache waiting on an explicit rule behind a running generation', async () => {
    const gate = deferred<unknown[]>();
    const deleteCache = vi.fn(async () => undefined);
    const broker = createModelBroker(manifest, {
      ...baseAdapter(),
      generateCandidates: vi.fn(async () => gate.promise),
      deleteCache
    }, runtime);
    await broker.install();

    const generation = broker.generateCandidates(request);
    const busy = await broker.deleteCache();

    expect(busy).toEqual({ ok: false, error: { code: 'busy', message: 'The local model is busy' } });
    expect(deleteCache).not.toHaveBeenCalled();
    gate.resolve([]);
    await generation;
  });
});
