import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

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

  it('parses --release as a flag instead of treating it as a ledger filename', async () => {
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(root, 'tools/lexicon/verify-source-ledger.mjs'), '--release'], { cwd: root });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('close', (code) => resolve({ code, stderr }));
    });
    expect(result.code).toBe(1);
    expect(result.stderr).not.toContain('ENOENT');
    expect(result.stderr).toContain('ledger status is engineering-candidate-review-required');
  });
});
