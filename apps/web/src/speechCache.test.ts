// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { speechModel, speechRuntimeArtifactsFor } from './speechConfig';
import { deleteSpeechModelCache, inspectSpeechModelCache, TRANSFORMERS_CACHE_NAME } from './speechCache';

type FakeRequest = Readonly<{ url: string }>;

class FakeCache {
  readonly entries = new Map<string, Response>();

  async keys(): Promise<FakeRequest[]> {
    return [...this.entries.keys()].map((url) => ({ url }));
  }

  async match(request: FakeRequest): Promise<Response | undefined> {
    return this.entries.get(request.url);
  }

  async delete(request: FakeRequest): Promise<boolean> {
    return this.entries.delete(request.url);
  }
}

const originalCaches = globalThis.caches;
const webgpuArtifactCount = speechModel.artifacts.filter((candidate) => candidate.devices.includes('webgpu')).length;
const wasmArtifactCount = speechModel.artifacts.filter((candidate) => candidate.devices.includes('wasm')).length;
const wasmRuntimeArtifactCount = speechRuntimeArtifactsFor('wasm').length;

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: originalCaches });
});

function digestBytes(hex: string): ArrayBuffer {
  return Uint8Array.from(hex.match(/../g)?.map((pair) => Number.parseInt(pair, 16)) ?? []).buffer;
}

function stubDigest(...digests: string[]): void {
  let digestIndex = 0;
  vi.stubGlobal('crypto', {
    subtle: {
      digest: vi.fn(async () => digestBytes(digests[digestIndex++] ?? ''))
    }
  });
}

function stubDigestByBody(digests: Readonly<Record<string, string>>): void {
  vi.stubGlobal('crypto', {
    subtle: {
      digest: vi.fn(async (_algorithm: AlgorithmIdentifier, data: BufferSource) => {
        const body = new TextDecoder().decode(new Uint8Array(data as ArrayBuffer));
        return digestBytes(digests[body] ?? '00'.repeat(32));
      })
    }
  });
}

describe('speech model cache ownership', () => {
  it('reports complete artifacts for the selected device profile', async () => {
    const cache = new FakeCache();
    const expected = speechModel.artifacts.filter((candidate) => candidate.devices.includes('wasm'));
    for (const artifact of expected) {
      const url = `https://huggingface.co/${speechModel.id}/resolve/${speechModel.revision}/${artifact.path}`;
      cache.entries.set(url, new Response(artifact.path, { headers: { 'content-length': `${artifact.bytes}` } }));
    }
    for (const artifact of speechRuntimeArtifactsFor('wasm')) {
      cache.entries.set(artifact.url, new Response(artifact.path, { headers: { 'content-length': `${artifact.bytes}` } }));
    }
    stubDigestByBody(Object.fromEntries([
      ...expected.map((artifact) => [artifact.path, artifact.sha256]),
      ...speechRuntimeArtifactsFor('wasm').map((artifact) => [artifact.path, artifact.sha256])
    ]));
    const open = vi.fn(async () => cache);
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open } });

    await expect(inspectSpeechModelCache('wasm')).resolves.toMatchObject({
      status: 'cached',
      cachedFiles: wasmArtifactCount + wasmRuntimeArtifactCount,
      expectedFiles: wasmArtifactCount + wasmRuntimeArtifactCount
    });
    expect(open).toHaveBeenCalledWith(TRANSFORMERS_CACHE_NAME);
  });

  it('does not report offline readiness when runtime artifacts are missing', async () => {
    const cache = new FakeCache();
    const expected = speechModel.artifacts.filter((candidate) => candidate.devices.includes('wasm'));
    for (const artifact of expected) {
      const url = `https://huggingface.co/${speechModel.id}/resolve/${speechModel.revision}/${artifact.path}`;
      cache.entries.set(url, new Response(artifact.path, { headers: { 'content-length': `${artifact.bytes}` } }));
    }
    stubDigestByBody(Object.fromEntries(expected.map((artifact) => [artifact.path, artifact.sha256])));
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: vi.fn(async () => cache) } });

    await expect(inspectSpeechModelCache('wasm')).resolves.toMatchObject({
      status: 'partial',
      cachedFiles: wasmArtifactCount,
      expectedFiles: wasmArtifactCount + wasmRuntimeArtifactCount,
      corruptFiles: 0
    });
  });

  it('reports a partial cache without treating missing artifacts as corrupt', async () => {
    const cache = new FakeCache();
    const artifact = speechModel.artifacts.find((candidate) => candidate.path === 'config.json');
    if (!artifact) throw new Error('Config artifact is missing');
    const url = `https://huggingface.co/${speechModel.id}/resolve/${speechModel.revision}/${artifact.path}`;
    cache.entries.set(url, new Response('config', { headers: { 'content-length': `${artifact.bytes}` } }));
    stubDigest(artifact.sha256);
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: vi.fn(async () => cache) } });

    await expect(inspectSpeechModelCache('webgpu')).resolves.toMatchObject({
      status: 'partial',
      bytes: artifact.bytes,
      cachedFiles: 1,
      expectedFiles: webgpuArtifactCount,
      corruptFiles: 0
    });
  });

  it('reports an empty cache as not cached', async () => {
    const cache = new FakeCache();
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: vi.fn(async () => cache) } });

    await expect(inspectSpeechModelCache('wasm')).resolves.toMatchObject({
      status: 'not-cached',
      bytes: 0,
      cachedFiles: 0,
      expectedFiles: wasmArtifactCount + wasmRuntimeArtifactCount,
      corruptFiles: 0
    });
  });

  it('reports unavailable Cache Storage as unknown', async () => {
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: undefined });

    await expect(inspectSpeechModelCache('webgpu')).resolves.toMatchObject({
      status: 'unknown',
      expectedFiles: webgpuArtifactCount
    });
  });

  it('marks a present artifact corrupt when its digest does not match', async () => {
    const cache = new FakeCache();
    const artifact = speechModel.artifacts.find((candidate) => candidate.path === 'config.json');
    if (!artifact) throw new Error('Config artifact is missing');
    const url = `https://huggingface.co/${speechModel.id}/resolve/${speechModel.revision}/${artifact.path}`;
    cache.entries.set(url, new Response('wrong bytes'));
    stubDigest('00'.repeat(32));
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: vi.fn(async () => cache) } });

    await expect(inspectSpeechModelCache('webgpu')).resolves.toMatchObject({
      status: 'corrupt',
      bytes: 11,
      cachedFiles: 1,
      corruptFiles: 1
    });
  });

  it('deletes only files owned by the pinned speech model', async () => {
    const cache = new FakeCache();
    const speechUrl = `https://huggingface.co/${speechModel.id}/resolve/${speechModel.revision}/config.json`;
    const runtimeUrl = speechRuntimeArtifactsFor('wasm')[0]?.url;
    const otherUrl = 'https://huggingface.co/other/model/resolve/main/config.json';
    cache.entries.set(speechUrl, new Response('speech'));
    if (runtimeUrl) cache.entries.set(runtimeUrl, new Response('runtime'));
    cache.entries.set(otherUrl, new Response('other'));
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: vi.fn(async () => cache) } });

    await expect(deleteSpeechModelCache()).resolves.toBe(runtimeUrl ? 2 : 1);
    expect(cache.entries.has(speechUrl)).toBe(false);
    if (runtimeUrl) expect(cache.entries.has(runtimeUrl)).toBe(false);
    expect(cache.entries.has(otherUrl)).toBe(true);
  });
});
