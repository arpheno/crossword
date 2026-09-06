#!/usr/bin/env node
// Injects the exact Vite build manifest into dist/sw.js (ADR 0006): every
// emitted entry plus the boot assets becomes the offline precache list.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const distDir = process.argv[2] ?? 'dist';

/**
 * Pure transform so the manifest rules are unit-testable.
 * @param {unknown} manifest Vite build manifest (entry/chunk/asset records)
 * @param {{ index?: string; extras?: readonly string[] }} boot boot assets
 * @returns {string[]} sorted, de-duplicated root-relative URLs
 */
export function buildPrecacheUrls(manifest, boot = {}) {
  const index = boot.index ?? '/index.html';
  const extras = boot.extras ?? ['/manifest.webmanifest', '/data/fill-lexicon-v1.txt'];
  const urls = new Set(['/', index, ...extras]);
  if (manifest && typeof manifest === 'object') {
    for (const [key, record] of Object.entries(manifest)) {
      if (!record || typeof record !== 'object') continue;
      const entry = record;
      if (key === 'index.html' || entry.isEntry) urls.add('/' + (entry.file ?? key));
      else if (entry.file) urls.add('/' + entry.file);
      for (const item of entry.css ?? []) urls.add('/' + item);
      for (const item of entry.assets ?? []) urls.add('/' + item);
    }
  }
  return [...urls].sort();
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (!invokedDirectly) {
  // Imported for its pure transform in tests.
  void 0;
} else {
const manifestPath = path.join(distDir, '.vite', 'manifest.json');
const swPath = path.join(distDir, 'sw.js');
const [manifestRaw, swSource] = await Promise.all([readFile(manifestPath, 'utf8'), readFile(swPath, 'utf8')]);
const manifest = JSON.parse(manifestRaw);
const urls = buildPrecacheUrls(manifest);
if (urls.length <= 3) throw new Error('Precache manifest is suspiciously small; refusing to ship an offline-broken shell');
const updated = swSource.replace(
  'self.__CROSSWORD_PRECACHE__',
  JSON.stringify(urls)
);
if (updated === swSource) throw new Error('dist/sw.js does not contain the precache placeholder');
await writeFile(swPath, updated);
console.log('[sw] precached ' + urls.length + ' URLs into ' + swPath);
}
