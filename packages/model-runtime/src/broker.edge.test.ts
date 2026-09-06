import { describe, expect, it, vi } from 'vitest';

import { createModelBroker, type LocalModelAdapter, type ModelManifest, type RuntimeProbe } from './broker';

const manifest: ModelManifest = {
  schemaVersion: 1,
  id: 'edge-model',
  version: 'q4',
  quantization: 'Q4_K_M',
  runtimeVersion: 'fixture',
  promptVersion: 'fixture',
  minimumMemoryMb: 1,
  shards: [{ url: '/fixture.bin', sha256: 'a'.repeat(64), bytes: 1 }]
};

const runtime: RuntimeProbe = {
  webgpu: true,
  availableMemoryMb: 2,
  storageQuotaBytes: 2,
  storageUsageBytes: 0
};

const request = {
  seed: 'edge',
  audienceSummary: 'broad',
  requestedRoles: ['general'] as const,
  excludedAnswers: [],
  maxSuggestions: 2
};

function adapter(overrides: Partial<LocalModelAdapter> = {}): LocalModelAdapter {
  return {
    install: vi.fn(async () => undefined),
    load: vi.fn(async () => undefined),
    generateCandidates: vi.fn(async () => []),
    resolveSpokenAnswer: vi.fn(async () => []),
    composeClues: vi.fn(async () => [{ mechanism: 'direct', text: 'A clue', difficulty: 0.2 }]),
    unload: vi.fn(async () => undefined),
    ...overrides
  };
}

async function loadedBroker(modelAdapter = adapter()) {
  const broker = createModelBroker(manifest, modelAdapter, runtime);
  await broker.install();
  await broker.load();
  return broker;
}

describe('model broker edge contracts', () => {
  it('rejects malformed manifests and insufficient storage before adapter work', async () => {
    expect(() => createModelBroker({ ...manifest, shards: [{ ...manifest.shards[0]!, sha256: 'bad' }] }, adapter(), runtime)).toThrow('Invalid model manifest');

    const modelAdapter = adapter();
    const broker = createModelBroker(manifest, modelAdapter, { ...runtime, storageQuotaBytes: 0 });
    const result = await broker.install();

    expect(result).toEqual({ ok: false, error: { code: 'storage-quota', message: 'There is not enough local storage for the pinned model' } });
    expect(modelAdapter.install).not.toHaveBeenCalled();
  });

  it('cancels installation both before and after adapter work', async () => {
    const before = createModelBroker(manifest, adapter(), runtime);
    const beforeController = new AbortController();
    beforeController.abort();
    await expect(before.install(beforeController.signal)).resolves.toEqual({
      ok: false,
      error: { code: 'cancelled', message: 'Model installation cancelled' }
    });

    // ADR 0004 §2: the adapter owns the cancellation boundary — it disposes a
    // just-completed creation and surfaces the cancellation as a thrown error.
    // The broker derives state from that outcome.
    const afterController = new AbortController();
    const afterAdapter = adapter({
      install: vi.fn(async () => {
        afterController.abort();
        throw new Error('Local model operation cancelled');
      })
    });
    const after = createModelBroker(manifest, afterAdapter, runtime);
    await expect(after.install(afterController.signal)).resolves.toEqual({
      ok: false,
      error: { code: 'cancelled', message: 'Model installation cancelled' }
    });
    expect(after.state()).toBe('uninstalled');
  });

  it('rejects bounded request violations and recovers after invalid output', async () => {
    const broker = await loadedBroker(adapter({ generateCandidates: vi.fn(async () => [{ surface: 'CAT' }]) }));

    await expect(broker.generateCandidates({ ...request, maxSuggestions: 0 })).resolves.toEqual({
      ok: false,
      error: { code: 'invalid-model-output', message: 'Candidate request contains invalid bounded constraints' }
    });
    await expect(broker.generateCandidates(request)).resolves.toEqual({
      ok: false,
      error: { code: 'invalid-model-output', message: 'The local model returned an invalid candidate bag' }
    });
    expect(broker.state()).toBe('loaded');
  });

  it('keeps the broker usable when unload fails', async () => {
    // RTO-P1-1: every broker command follows the typed-result convention; the
    // state stays conservatively loaded because residency was not provably
    // released (ADR 0004 §5).
    const broker = await loadedBroker(adapter({ unload: vi.fn(async () => { throw new Error('device lost'); }) }));

    await expect(broker.unload()).resolves.toEqual({ ok: false, error: { code: 'runtime-error', message: 'device lost' } });
    expect(broker.state()).toBe('loaded');
    await expect(broker.generateCandidates(request)).resolves.toEqual({ ok: true, value: [] });
  });
});