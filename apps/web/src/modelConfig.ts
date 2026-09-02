import type { ModelManifest, RuntimeProbe } from '@crossword/model-runtime';

export const localModelManifest: ModelManifest = {
  schemaVersion: 1,
  id: 'qwen3:0.6b',
  version: '0.6b',
  quantization: 'Q4_K_M',
  runtimeVersion: 'ollama-api-v1',
  promptVersion: 'candidate-v2',
  minimumMemoryMb: 2_048,
  shards: [],
  distribution: 'ollama'
};

export const localModelUrl = import.meta.env.VITE_LOCAL_MODEL_URL ?? 'http://127.0.0.1:11434';

export function browserRuntimeProbe(): RuntimeProbe {
  const browserNavigator = navigator as Navigator & { deviceMemory?: number };
  return {
    webgpu: 'gpu' in navigator,
    availableMemoryMb: typeof browserNavigator.deviceMemory === 'number' ? browserNavigator.deviceMemory * 1024 : 0,
    storageQuotaBytes: 0,
    storageUsageBytes: 0
  };
}