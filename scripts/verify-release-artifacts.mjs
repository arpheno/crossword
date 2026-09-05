#!/usr/bin/env node
/**
 * Verify the files that are actually shipped by the web release.
 *
 * The content scanner catches known text signatures. This check covers the
 * artifact boundary itself: private data must be absent, the published
 * lexicon must match its manifest, and the service worker may only precache
 * the approved public data file.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

export async function verifyReleaseArtifacts({
  distDir = path.join(repoRoot, 'apps', 'web', 'dist'),
  lexiconManifestPath = path.join(repoRoot, 'packages', 'construction', 'data', 'fill-lexicon-v1.json')
} = {}) {
  const errors = [];
  const dist = path.resolve(distDir);
  const manifestPath = path.resolve(lexiconManifestPath);
  let manifest;
  let lexicon;
  let serviceWorker;

  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    errors.push(`cannot read lexicon manifest: ${error instanceof Error ? error.message : String(error)}`);
  }

  const readDist = async (relativePath) => {
    try {
      return await readFile(path.join(dist, relativePath));
    } catch {
      errors.push(`missing release artifact: ${toPosix(relativePath)}`);
      return undefined;
    }
  };

  lexicon = await readDist(path.join('data', 'fill-lexicon-v1.txt'));
  serviceWorker = await readDist('sw.js');
  for (const privatePath of ['data/freq-prior-v1.txt', 'data/freq-prior-v1.json']) {
    try {
      await stat(path.join(dist, privatePath));
      errors.push(`private artifact is present in release: ${privatePath}`);
    } catch {
      // Absence is the expected release state.
    }
  }

  if (manifest && lexicon) {
    const expected = manifest.artifact?.sha256;
    const actual = sha256(lexicon);
    if (!expected || expected !== actual) errors.push(`lexicon digest mismatch: expected ${expected ?? 'missing'}, got ${actual}`);
    const lines = lexicon.toString('utf8').split(/\r?\n/).filter(Boolean);
    if (manifest.wordCount !== lines.length) errors.push(`lexicon count mismatch: manifest ${manifest.wordCount ?? 'missing'}, release ${lines.length}`);
  }

  if (serviceWorker) {
    const source = serviceWorker.toString('utf8');
    if (!source.includes('/data/fill-lexicon-v1.txt')) errors.push('service worker does not precache the public fill lexicon');
    if (source.includes('freq-prior-v1')) errors.push('service worker references the private frequency prior');
  }

  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const result = await verifyReleaseArtifacts({ distDir: process.argv[2] });
  if (!result.ok) {
    for (const error of result.errors) console.error(`RELEASE ARTIFACT ERROR: ${error}`);
    process.exit(1);
  }
  console.log('release artifacts ok');
}
