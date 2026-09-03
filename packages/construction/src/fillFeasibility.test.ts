import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { curatedTemplateBank } from './templateBank';
import { deriveTopology } from './topology';
import { loadLexicon } from './lexicon';
import { solveFill } from './csp';

const artifactPath = path.resolve(__dirname, '../data/fill-lexicon-v1.txt');

function lexiconCandidates() {
  const text = readFileSync(artifactPath, 'utf8');
  const lexicon = loadLexicon(text);
  const words = text.split('\n').filter(Boolean);
  return words.map((word) => lexicon.resolve(word)!).filter(Boolean);
}

describe('15x15 fill feasibility (lab measurement)', () => {
  it('fills a curated template with the full lexicon', () => {
    const template = curatedTemplateBank().find((entry) => entry.id === 'double-stack-30')!;
    const derived = deriveTopology(template.mask, { templateId: template.id });
    if (!derived.ok) throw new Error(JSON.stringify(derived.violations));

    const started = Date.now();
    const result = solveFill({
      slots: derived.topology.slots,
      intersections: derived.topology.intersections,
      candidates: lexiconCandidates(),
      seed: 7,
      maxNodes: 400_000
    });
    const elapsed = Date.now() - started;

    console.log(`double-stack-30: ${result.status} in ${elapsed}ms`, result.status === 'solved' ? {
      score: result.solution?.score,
      nodes: result.solution?.nodes
    } : result.failure);

    expect(result.status).toBe('solved');
  }, 300_000);
});
