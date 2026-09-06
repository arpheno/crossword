import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyReleaseArtifacts } from './verify-release-artifacts.mjs';

const temporaryDirectories = [];
const digest = (value) => createHash('sha256').update(value).digest('hex');

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture({ includePrivate = false, wrongDigest = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'crossword-release-'));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, 'dist', 'data'), { recursive: true });
  const lexicon = Buffer.from('CAT\nDOG\n');
  await writeFile(path.join(root, 'dist', 'data', 'fill-lexicon-v1.txt'), lexicon);
  await writeFile(path.join(root, 'dist', 'sw.js'), `const urls = ['/data/fill-lexicon-v1.txt'${includePrivate ? ", '/data/freq-prior-v1.txt'" : ''}];`);
  if (includePrivate) await writeFile(path.join(root, 'dist', 'data', 'freq-prior-v1.txt'), 'CAT 12\n');
  const manifest = {
    wordCount: 2,
    artifact: { sha256: wrongDigest ? 'wrong' : digest(lexicon) }
  };
  const manifestPath = path.join(root, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest));
  return { distDir: path.join(root, 'dist'), lexiconManifestPath: manifestPath };
}

describe('release artifact verification', () => {
  it('accepts a public lexicon with a matching manifest', async () => {
    expect((await verifyReleaseArtifacts(await fixture())).ok).toBe(true);
  });

  it('rejects private data and digest drift', async () => {
    const result = await verifyReleaseArtifacts(await fixture({ includePrivate: true, wrongDigest: true }));
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('private artifact is present'),
      expect.stringContaining('lexicon digest mismatch'),
      expect.stringContaining('service worker references')
    ]));
  });
});
