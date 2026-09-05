import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildInventory, normalizeSurface } from './build-inventory.mjs';

const source = (id, license, pinned = true) => ({
  id, name: id, version: 'fixture-1', url: `https://example.test/${id}`,
  ...(pinned ? { sha256: createHash('sha256').update(id).digest('hex') } : {}),
  license, attribution: 'fixture', retrievedAt: '2026-09-05'
});

describe('inventory build adapter', () => {
  it('normalizes supported display forms without accepting digits or symbols', () => {
    expect(normalizeSurface('café')).toMatchObject({ answerForm: 'CAFE' });
    expect(normalizeSurface('cold snap')).toMatchObject({ answerForm: 'COLDSNAP' });
    expect(normalizeSurface('R2D2')).toBeUndefined();
    expect(normalizeSurface('bad/slash')).toBeUndefined();
  });

  it('joins CWL, ESDB, and Wiktextract evidence while leaving records for review', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'crossword-inventory-'));
    const cwl = path.join(dir, 'cwl.dict');
    const esdb = path.join(dir, 'esdb.txt');
    const wiktextract = path.join(dir, 'wiktextract.jsonl');
    await writeFile(cwl, 'crane;80\ncold snap;70\n');
    await writeFile(esdb, 'CRANE\nCOLD\nSNAP\n');
    await writeFile(wiktextract, `${JSON.stringify({ word: 'crane', lang_code: 'en', pos: 'noun', senses: [{ glosses: ['A long-necked bird.'] }] })}\n`);
    const records = await buildInventory({
      cwl: { path: cwl, source: source('cwl', 'MIT') },
      esdb: { path: esdb, source: source('esdb', 'ESDB-CUSTOM') },
      wiktextract: { path: wiktextract, source: source('wiktextract', 'CC-BY-SA-4.0') }
    });
    expect(records.map((record) => record.answerForm)).toEqual(['COLD', 'COLDSNAP', 'CRANE', 'SNAP']);
    expect(records.find((record) => record.answerForm === 'CRANE')).toMatchObject({ eligibility: 'review', signals: { spellingEvidence: 'both' } });
    expect(records.find((record) => record.answerForm === 'CRANE')?.senses[0]).toMatchObject({ gloss: 'A long-necked bird.', status: 'limited' });
  });

  it('refuses an unpinned source receipt instead of emitting a placeholder hash', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'crossword-inventory-'));
    const cwl = path.join(dir, 'cwl.dict');
    await writeFile(cwl, 'crane;80\n');
    await expect(buildInventory({
      cwl: { path: cwl, source: source('unpinned', 'MIT', false) }
    })).rejects.toThrow(/pinned 64-character sha256/);
  });
});
