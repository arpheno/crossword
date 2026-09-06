import { describe, expect, it } from 'vitest';
import { parseModelWorkerRequest, parseModelWorkerResponse } from './workerProtocol';

const config = {
  manifest: {
    schemaVersion: 1 as const,
    id: 'fixture-model',
    version: '1',
    quantization: 'fixture',
    runtimeVersion: 'fixture',
    promptVersion: 'fixture',
    minimumMemoryMb: 1,
    shards: [{ url: '/fixture', sha256: 'a'.repeat(64), bytes: 1 }]
  },
  runtime: { webgpu: true, availableMemoryMb: 2, storageQuotaBytes: 2, storageUsageBytes: 0 }
};

describe('model worker protocol', () => {
  it('accepts configure, execution, and cancellation messages', () => {
    expect(parseModelWorkerRequest({ version: 1, type: 'configure', requestId: 'one', config })).toMatchObject({ type: 'configure', requestId: 'one' });
    expect(parseModelWorkerRequest({
      version: 1,
      type: 'execute',
      requestId: 'two',
      operation: 'generate-candidates',
      payload: {
        seed: 'fixture',
        audienceSummary: 'broad',
        requestedRoles: ['theme', 'long'],
        excludedAnswers: [],
        maxSuggestions: 32,
        focus: 'coastal ecology and long domain vocabulary',
        targetLengths: [10, 11, 12, 13, 14, 15]
      }
    })).toMatchObject({ type: 'execute', operation: 'generate-candidates' });
    expect(parseModelWorkerRequest({ version: 1, type: 'execute', requestId: 'three', operation: 'load' })).toMatchObject({ type: 'execute', operation: 'load' });
    expect(parseModelWorkerRequest({
      version: 1,
      type: 'execute',
      requestId: 'four',
      operation: 'resolve-spoken-answer',
      payload: { spokenAnswer: 'see', targetLength: 3, pattern: '...', locale: 'en-US', maxSuggestions: 4 }
    })).toMatchObject({ type: 'execute', operation: 'resolve-spoken-answer' });
    expect(parseModelWorkerRequest({
      version: 1,
      type: 'execute',
      requestId: 'five',
      operation: 'resolve-spoken-answer',
      payload: { spokenAnswer: 'ox', targetLength: 2, pattern: '..', locale: 'en-US', maxSuggestions: 4 }
    })).toMatchObject({ type: 'execute', operation: 'resolve-spoken-answer' });
    expect(parseModelWorkerRequest({ version: 1, type: 'cancel', requestId: 'two' })).toEqual({ version: 1, type: 'cancel', requestId: 'two' });
  });

  it('accepts a positive integer byte estimate and rejects non-positive ones', () => {
    expect(parseModelWorkerRequest({ version: 1, type: 'configure', requestId: 'est', config: { ...config, manifest: { ...config.manifest, estimatedBytes: 1_200_000_000 } } })).toMatchObject({ type: 'configure' });
    expect(parseModelWorkerRequest({ version: 1, type: 'configure', requestId: 'zero', config: { ...config, manifest: { ...config.manifest, estimatedBytes: 0 } } })).toBeUndefined();
    expect(parseModelWorkerRequest({ version: 1, type: 'configure', requestId: 'frac', config: { ...config, manifest: { ...config.manifest, estimatedBytes: 1.5 } } })).toBeUndefined();
  });

  it('rejects invalid config, payloads, and results', () => {
    expect(parseModelWorkerRequest({ version: 1, type: 'configure', requestId: 'one', config: { ...config, manifest: { ...config.manifest, distribution: 'remote-cloud' } } })).toBeUndefined();
    expect(parseModelWorkerRequest({ version: 1, type: 'execute', requestId: 'two', operation: 'generate-candidates', payload: {} })).toBeUndefined();
    expect(parseModelWorkerRequest({ version: 1, type: 'execute', requestId: 'two', operation: 'resolve-spoken-answer', payload: { spokenAnswer: 'see', targetLength: 3, pattern: 'bad', locale: 'en-US', maxSuggestions: 4 } })).toBeUndefined();
    expect(parseModelWorkerRequest({ version: 1, type: 'execute', requestId: 'three', operation: 'resolve-spoken-answer', payload: { spokenAnswer: 'too long', targetLength: 65, pattern: '.'.repeat(65), locale: 'en-US', maxSuggestions: 4 } })).toBeUndefined();
    expect(parseModelWorkerRequest({
      version: 1,
      type: 'execute',
      requestId: 'three',
      operation: 'generate-candidates',
      payload: {
        seed: 'fixture',
        audienceSummary: 'broad',
        requestedRoles: ['long'],
        excludedAnswers: [],
        maxSuggestions: 32,
        targetLengths: [2]
      }
    })).toBeUndefined();
    expect(parseModelWorkerResponse({ version: 1, type: 'result', requestId: 'one', operation: 'load', result: { ok: false, error: { code: 'unknown', message: 'bad' } } })).toBeUndefined();
    expect(parseModelWorkerResponse({ version: 1, type: 'result', requestId: 'two', operation: 'resolve-spoken-answer', result: { ok: true, value: 'SEE' } })).toBeUndefined();
  });
});