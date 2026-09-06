import { describe, expect, it, vi } from 'vitest';
import type { ModelManifest } from './broker';
import { createWebLLMAdapter, type WebLlmEngine, type WebLlmModule } from './webllmAdapter';

const manifest: ModelManifest = {
  schemaVersion: 1,
  id: 'fixture-model',
  version: '1',
  quantization: 'q4',
  runtimeVersion: 'fixture',
  promptVersion: 'fixture',
  minimumMemoryMb: 1,
  shards: []
};

function engine(): WebLlmEngine {
  return {
    chat: { completions: { create: vi.fn(async () => ({ choices: [{ message: { content: '[]' } }] })) } },
    unload: vi.fn(async () => undefined),
    interruptGenerate: vi.fn()
  } as unknown as WebLlmEngine;
}

describe('WebLLM lifecycle telemetry', () => {
  it('forwards initialization progress and owns cache inspection/deletion', async () => {
    const current = engine();
    let callback: ((progress: number, text: string) => void) | undefined;
    const module = {
      prebuiltAppConfig: { model_list: [{ model_id: manifest.id }] },
      hasModelInCache: vi.fn(async () => true),
      deleteModelAllInfoInCache: vi.fn(async () => undefined)
    } as unknown as WebLlmModule;
    const adapter = createWebLLMAdapter({
      loadModule: async () => module,
      createEngine: async (_modelId, onProgress) => {
        callback = onProgress;
        return current;
      }
    });
    const progress: unknown[] = [];

    await adapter.install(manifest, undefined, (event) => progress.push(event));
    callback?.(0.61, 'Fetching tensors');
    expect(progress).toEqual([{ phase: 'downloading', progress: 0.61, text: 'Fetching tensors' }]);
    await expect(adapter.hasCache?.(manifest)).resolves.toBe(true);
    await adapter.deleteCache?.(manifest);
    expect(module.deleteModelAllInfoInCache).toHaveBeenCalledWith(manifest.id, module.prebuiltAppConfig);
  });
});
