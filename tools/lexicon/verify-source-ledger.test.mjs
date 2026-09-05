import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('source ledger contract', () => {
  it('records every proposed inventory source with terms and a transformation', async () => {
    const ledger = JSON.parse(await readFile(path.join(root, 'tools/lexicon/source-ledger.json'), 'utf8'));
    const sources = ledger.inventorySourceDecisions.sources;
    expect(sources.length).toBeGreaterThanOrEqual(6);
    for (const source of sources) {
      expect(source.id).toEqual(expect.any(String));
      expect(source.url).toMatch(/^https?:\/\//);
      expect(source.spdx).toEqual(expect.any(String));
      expect(source.transformation).toEqual(expect.any(String));
      expect(source.distribution).toEqual(expect.any(String));
    }
  });
});
