import { describe, expect, it } from 'vitest';
import { createModelBroker, type LocalModelAdapter, type ModelManifest, type RuntimeProbe } from './broker';

const manifest: ModelManifest = {
  schemaVersion: 1,
  id: 'telemetry-fixture',
  version: '1',
  quantization: 'q4',
  runtimeVersion: 'fixture',
  promptVersion: 'fixture',
  minimumMemoryMb: 1,
  shards: []
};

const runtime: RuntimeProbe = {
  webgpu: true,
  availableMemoryMb: null,
  storageQuotaBytes: 0,
  storageUsageBytes: 0
};

function adapter(events: string[]): LocalModelAdapter {
  return {
    install: async (_manifest, _signal, onProgress) => {
      onProgress?.({ phase: 'downloading', progress: 0.42, text: 'Fetching model artifacts' });
      events.push('install');
    },
    load: async () => events.push('load'),
    generateCandidates: async () => [],
    resolveSpokenAnswer: async () => [],
    composeClues: async () => [{ mechanism: 'direct', text: 'A clue', difficulty: 0.2 }],
    unload: async () => events.push('unload'),
    hasCache: async () => true,
    deleteCache: async () => events.push('delete')
  };
}

describe('model lifecycle telemetry', () => {
  it('reports cache state and forwards typed install progress', async () => {
    const events: string[] = [];
    const progress: unknown[] = [];
    const broker = createModelBroker(manifest, adapter(events), runtime);

    await expect(broker.inspectCache()).resolves.toEqual({ ok: true, value: true });
    await expect(broker.install(undefined, (event) => progress.push(event))).resolves.toEqual({ ok: true, value: undefined });
    expect(progress).toEqual([{ phase: 'downloading', progress: 0.42, text: 'Fetching model artifacts' }]);
    expect(events).toEqual(['install']);
  });

  it('deletes cache and returns to the uninstalled state', async () => {
    const events: string[] = [];
    const broker = createModelBroker(manifest, adapter(events), runtime);
    await broker.install();
    await expect(broker.deleteCache()).resolves.toEqual({ ok: true, value: undefined });
    expect(events).toEqual(['install', 'delete']);
    expect(broker.state()).toBe('uninstalled');
  });
});
