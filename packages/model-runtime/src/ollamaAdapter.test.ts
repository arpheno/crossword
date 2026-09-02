import { describe, expect, it } from 'vitest';
import { createOllamaAdapter, type LocalModelFetch, type LocalModelResponse } from './ollamaAdapter';
import type { ModelManifest } from './broker';

const manifest: ModelManifest = {
  schemaVersion: 1,
  id: 'qwen3.8:27b',
  version: 'q4-k-m',
  quantization: 'Q4_K_M',
  runtimeVersion: 'ollama-fixture',
  promptVersion: 'candidate-v1',
  minimumMemoryMb: 1,
  shards: [{ url: 'http://127.0.0.1/model', sha256: 'a'.repeat(64), bytes: 1 }]
};

function response(value: unknown, ok = true, status = 200): LocalModelResponse {
  return {
    ok,
    status,
    json: async () => value,
    text: async () => JSON.stringify(value)
  };
}

function fetcherFor(responses: LocalModelResponse[]): LocalModelFetch {
  return async () => {
    const next = responses.shift();
    if (!next) throw new Error('No fixture response');
    return next;
  };
}

describe('Ollama local model adapter', () => {
  it('rejects non-loopback endpoints', () => {
    expect(() => createOllamaAdapter({ baseUrl: 'https://example.invalid', fetcher: fetcherFor([]) })).toThrow('loopback');
  });

  it('pulls, verifies, generates structured output, and unloads locally', async () => {
    const fetcher = fetcherFor([
      response({ status: 'success' }),
      response({ models: [{ name: manifest.id }] }),
      response({ response: '```json\n[{"surface":"CAT","intendedSense":"a small animal","associations":[],"role":"general","confidence":0.8}]\n```' })
    ]);
    const adapter = createOllamaAdapter({ fetcher });
    await adapter.install(manifest);
    await adapter.load(manifest);
    const result = await adapter.generateCandidates({
      seed: 'fixture',
      audienceSummary: 'broad',
      requestedRoles: ['general'],
      excludedAnswers: [],
      maxSuggestions: 1
    });
    expect(result).toEqual([{ surface: 'CAT', intendedSense: 'a small animal', associations: [], role: 'general', confidence: 0.8 }]);
    await adapter.unload();
    await expect(adapter.generateCandidates({
      seed: 'fixture',
      audienceSummary: 'broad',
      requestedRoles: ['general'],
      excludedAnswers: [],
      maxSuggestions: 1
    })).rejects.toThrow('not loaded');
  });

  it('propagates request cancellation and normalizes loose output', async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const fetcher: LocalModelFetch = async (_input, init) => {
      receivedSignal = init?.signal;
      return receivedSignal === undefined
        ? response({ models: [{ name: manifest.id }] })
        : response({ response: 'not json' });
    };
    const adapter = createOllamaAdapter({ fetcher });
    await adapter.load(manifest);
    const output = await adapter.generateCandidates({
      seed: 'fixture',
      audienceSummary: 'broad',
      requestedRoles: ['general'],
      excludedAnswers: [],
      maxSuggestions: 1
    }, controller.signal);
    controller.abort();
    expect(receivedSignal).toBe(controller.signal);
    expect(output).toEqual([{
      surface: 'not json',
      intendedSense: 'Unresolved model association',
      associations: [],
      role: 'general',
      confidence: 0.2
    }]);
  });

  it('normalizes simple candidate lists without bypassing broker validation', async () => {
    const fetcher = fetcherFor([
      response({ models: [{ name: manifest.id }] }),
      response({ response: '{"candidates":["TIDAL POOL", "KELPFOREST"]}' })
    ]);
    const adapter = createOllamaAdapter({ fetcher });
    await adapter.load(manifest);
    const output = await adapter.generateCandidates({
      seed: 'fixture',
      audienceSummary: 'broad',
      requestedRoles: ['long'],
      excludedAnswers: [],
      maxSuggestions: 2,
      focus: 'coastal ecology',
      targetLengths: [9, 10]
    });

    expect(output).toEqual([
      {
        surface: 'TIDAL POOL',
        intendedSense: 'Unresolved model association',
        associations: [],
        role: 'long',
        confidence: 0.2
      },
      {
        surface: 'KELPFOREST',
        intendedSense: 'Unresolved model association',
        associations: [],
        role: 'long',
        confidence: 0.2
      }
    ]);
  });

  it('normalizes lightweight-model answer fields and confidence labels', async () => {
    const fetcher = fetcherFor([
      response({ models: [{ name: manifest.id }] }),
      response({ response: '{"candidates":[{"answer":"coastal wetlands","intendedSense":"ecological feature","associations":["habitat",3],"role":"theme","confidence":"high"},{"answer":"mangroves","role":"interpreter","confidence":"low"}]}' })
    ]);
    const adapter = createOllamaAdapter({ fetcher });
    await adapter.load(manifest);
    const output = await adapter.generateCandidates({
      seed: 'fixture',
      audienceSummary: 'broad',
      requestedRoles: ['long'],
      excludedAnswers: [],
      maxSuggestions: 2,
      focus: 'coastal ecology',
      targetLengths: [9, 10]
    });

    expect(output).toEqual([
      {
        surface: 'coastal wetlands',
        intendedSense: 'ecological feature',
        associations: ['habitat'],
        role: 'theme',
        confidence: 0.8
      },
      {
        surface: 'mangroves',
        intendedSense: 'Unresolved model association',
        associations: [],
        role: 'long',
        confidence: 0.2
      }
    ]);
  });
});