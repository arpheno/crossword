// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadLexicon, type FillRequest, type Lexicon } from '@crossword/construction';
import { createFakeLocalModelAdapter, createModelBroker, type CandidateRequest, type ModelBroker, type ModelManifest } from '@crossword/model-runtime';
import { constructPuzzle, targetLengthPages } from './constructPuzzle';
import { constructableDays, dayRecipe } from './recipes';

// Review 2.5 / work package 0A: the REAL broker contract (length caps, state
// machine, output validation) must accept every constructable day's request.
// The fake port alone is not a boundary test.
const MANIFEST: ModelManifest = {
  schemaVersion: 1,
  id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  version: '3.2-1b',
  quantization: 'q4f16_1',
  runtimeVersion: 'webllm-0.2.84',
  promptVersion: 'candidate-v2',
  minimumMemoryMb: 2_048,
  shards: [],
  distribution: 'webllm-mlc'
};

const THEME_ENTRIES = ['ABANDONMENT', 'LIGHTHEADED']; // 11 letters: the calibration template's longest slots

function realBrokerAroundFake(requests: CandidateRequest[]): ModelBroker {
  const fakeAdapter = createFakeLocalModelAdapter({
    suggestions: [
      ...['ARIA', 'ERA', 'EEL', 'STARE', 'TREATS', 'OAK', 'ELM', 'ASH'].map((surface) => ({
        surface,
        intendedSense: 'fixture sense',
        associations: [],
        role: 'general' as const,
        confidence: 0.6
      })),
      ...THEME_ENTRIES.map((surface) => ({
        surface,
        intendedSense: 'fixture theme',
        associations: [],
        role: 'theme' as const,
        confidence: 0.9
      }))
    ],
    clueDrafts: [
      { mechanism: 'direct' as const, text: 'Fixture direct clue', difficulty: 0.2 },
      { mechanism: 'standard' as const, text: 'Fixture standard clue', difficulty: 0.4 }
    ]
  });
  const adapter = {
    ...fakeAdapter,
    generateCandidates: async (request: CandidateRequest, signal?: AbortSignal) => {
      requests.push(request);
      return fakeAdapter.generateCandidates(request, signal);
    }
  };
  const broker = createModelBroker(MANIFEST, adapter, {
    webgpu: true,
    availableMemoryMb: 8_192,
    storageQuotaBytes: 10_000_000_000,
    storageUsageBytes: 0
  });
  return broker;
}

function labLexicon(): Lexicon {
  // 11 letters covers the calibration template; capping the slice keeps this
  // boundary lane fast. Eligibility contracts are unchanged.
  const text = readFileSync(path.resolve(__dirname, '../../construction/data/fill-lexicon-v1.txt'), 'utf8');
  return loadLexicon(text, { maxLength: 11 });
}

function stopBeforeSearch(request: FillRequest) {
  void request;
  return {
    status: 'failed' as const,
    failure: {
      code: 'resource-limit' as const,
      message: 'Boundary test stops before full-grid search',
      nodes: 0
    },
    termination: 'node-limit' as const,
    terminationReason: 'node-limit' as const,
    nodesExplored: 0
  };
}

describe('constructPuzzle through the real broker boundary (work package 0A)', () => {
  const lexicon = labLexicon();

  it('splits synthetic topologies into broker-safe target-length pages', () => {
    expect(targetLengthPages([11, 3, 4, 5, 6, 7, 8, 9, 10, 12])).toEqual([
      [3, 4, 5, 6, 7, 8, 9, 10],
      [11, 12]
    ]);
  });

  it.each(constructableDays())('%s passes the real broker contract before fill', async (day) => {
    const requests: CandidateRequest[] = [];
    const broker = realBrokerAroundFake(requests);
    await broker.install();
    await broker.load();
    const result = await constructPuzzle(
      broker,
      { solve: stopBeforeSearch },
      {
        recipe: {
          ...dayRecipe(day),
          // Pin to the measured calibration template so theme-lock lengths are
          // deterministic; the boundary contract, not fill depth, is under test.
          templateIds: ['human-15x15'],
          maxNodes: 15_000,
          qualityThreshold: 0.3,
          maxRestarts: 1
        },
        seed: `real-broker-${day}`,
        lexicon,
        modelId: MANIFEST.id
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.stage, `${day}: ${JSON.stringify(result.error)}`).toBe('fill');
      expect(result.error.code).toBe('exhausted-restarts');
    }
    expect(requests).toHaveLength(1);
    expect(requests.every((request) => (request.targetLengths?.length ?? 0) <= 8)).toBe(true);
    expect([...new Set(requests.flatMap((request) => request.targetLengths ?? []))].sort((left, right) => left - right))
      .toEqual([3, 4, 5, 6, 9, 10, 11]);
  }, 120_000);
});
