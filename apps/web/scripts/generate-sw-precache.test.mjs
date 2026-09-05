import { describe, expect, it } from 'vitest';
import { buildPrecacheUrls } from './generate-sw-precache.mjs';

describe('service-worker precache manifest (PO-P0-2)', () => {
  it('collects every emitted entry, chunk, css, and asset plus boot assets', () => {
    const manifest = {
      'index.html': { file: 'assets/index-BoOt.html', src: 'index.html', isEntry: true },
      'src/main.tsx': { file: 'assets/index-Ma1n.js', name: 'index', src: 'src/main.tsx', isEntry: true, css: ['assets/index-StYl.css'] },
      'workers/modelWorker.ts': { file: 'assets/modelWorker-W0rk.js', name: 'modelWorker', src: 'workers/modelWorker.ts' },
      'workers/llmEngineWorker.ts': { file: 'assets/llmEngineWorker-3ng1ne.js', name: 'llmEngineWorker', src: 'workers/llmEngineWorker.ts' },
      'icon.svg': { file: 'assets/icon-1c0n.svg', src: 'icon.svg' }
    };
    const urls = buildPrecacheUrls(manifest);
    expect(urls).toContain('/assets/index-BoOt.html');
    expect(urls).toContain('/assets/index-Ma1n.js');
    expect(urls).toContain('/assets/index-StYl.css');
    expect(urls).toContain('/assets/modelWorker-W0rk.js');
    expect(urls).toContain('/assets/llmEngineWorker-3ng1ne.js');
    expect(urls).toContain('/assets/icon-1c0n.svg');
    expect(urls).toContain('/index.html');
    expect(urls).toContain('/manifest.webmanifest');
    expect(urls).toContain('/data/fill-lexicon-v1.txt');
    expect(urls).not.toContain('/data/freq-prior-v1.txt');
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('is sorted and de-duplicated', () => {
    const urls = buildPrecacheUrls({}, { extras: ['/b.txt', '/a.txt'] });
    expect(urls).toEqual([...urls].sort());
  });
});
