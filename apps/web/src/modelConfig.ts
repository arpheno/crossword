import type { ModelManifest, RuntimeProbe } from '@crossword/model-runtime';

// Dev-default pin per ADR 0002: the final model choice is an open owner
// decision (plans README). In-browser WebLLM 0.2.84 downloads weights from
// the pinned MLC host into browser storage at install time; no loopback or
// remote inference endpoint exists in this application.
export const localModelManifest: ModelManifest = {
  schemaVersion: 1,
  id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  version: '3.2-1b',
  quantization: 'q4f16_1',
  runtimeVersion: 'webllm-0.2.84',
  promptVersion: 'candidate-v2',
  minimumMemoryMb: 2_048,
  shards: [],
  distribution: 'webllm-mlc',
  // Conservative upper bound for the Llama-3.2-1B q4f16_1 MLC download
  // (~0.9 GB of weights plus runtime headroom). The preflight uses this when
  // shard receipts are absent; the UI must present it as an estimate, never a
  // measured size (ADR 0004 §7).
  estimatedBytes: 1_200_000_000
};

export function browserRuntimeProbe(): RuntimeProbe {
  const browserNavigator = navigator as Navigator & { deviceMemory?: number };
  return {
    webgpu: 'gpu' in navigator,
    // `deviceMemory` is optional. Preserve “unknown” instead of turning it
    // into zero and incorrectly blocking capable browsers.
    availableMemoryMb: typeof browserNavigator.deviceMemory === 'number' ? browserNavigator.deviceMemory * 1024 : null,
    storageQuotaBytes: 0,
    storageUsageBytes: 0
  };
}