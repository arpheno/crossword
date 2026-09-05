import { speechModel, speechRuntimeArtifactsFor, type SpeechDevice, type SpeechModelArtifact, type SpeechRuntimeArtifact } from './speechConfig';

export const TRANSFORMERS_CACHE_NAME = 'transformers-cache';

export type SpeechCacheStatus = 'unknown' | 'not-cached' | 'partial' | 'cached' | 'corrupt';

export type SpeechCacheReport = Readonly<{
  status: SpeechCacheStatus;
  bytes: number;
  cachedFiles: number;
  expectedFiles: number;
  corruptFiles: number;
}>;

const cachePrefix = `/${speechModel.id}/resolve/${speechModel.revision}/`;

type ExpectedArtifact = SpeechModelArtifact | SpeechRuntimeArtifact;

function expectedArtifactsFor(device: SpeechDevice): readonly ExpectedArtifact[] {
  return [
    ...speechModel.artifacts.filter((artifact) => artifact.devices.includes(device)),
    ...speechRuntimeArtifactsFor(device)
  ];
}

function artifactPath(url: string): string | undefined {
  try {
    const path = new URL(url).pathname;
    if (!path.startsWith(cachePrefix)) return undefined;
    return path.slice(cachePrefix.length);
  } catch {
    return undefined;
  }
}

function emptyReport(status: SpeechCacheStatus): SpeechCacheReport {
  return { status, bytes: 0, cachedFiles: 0, expectedFiles: 0, corruptFiles: 0 };
}

function expectedArtifactFor(url: string, device: SpeechDevice): Readonly<{ key: string; artifact: ExpectedArtifact }> | undefined {
  try {
    const path = new URL(url).pathname;
    if (path.startsWith(cachePrefix)) {
      const modelPath = path.slice(cachePrefix.length);
      const artifact = speechModel.artifacts.find((candidate) => candidate.devices.includes(device) && candidate.path === modelPath);
      return artifact ? { key: `model:${modelPath}`, artifact } : undefined;
    }
  } catch {
    return undefined;
  }
  const artifact = speechRuntimeArtifactsFor(device).find((candidate) => candidate.url === url);
  return artifact ? { key: `runtime:${artifact.url}`, artifact } : undefined;
}

function isOwnedArtifactUrl(url: string): boolean {
  if (artifactPath(url)) return true;
  return speechModel.runtimeArtifacts.some((artifact) => artifact.url === url);
}

async function responseSha256(response: Response): Promise<Readonly<{ digest: string; bytes: number }>> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Speech cache digest verification is unavailable.');
  const body = await response.arrayBuffer();
  const digest = await subtle.digest('SHA-256', body);
  return {
    digest: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
    bytes: body.byteLength
  };
}

export async function inspectSpeechModelCache(device: SpeechDevice): Promise<SpeechCacheReport> {
  const expected = expectedArtifactsFor(device);
  if (typeof caches === 'undefined') return { ...emptyReport('unknown'), expectedFiles: expected.length };

  try {
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
    const requests = await cache.keys();
    const cachedByKey = new Map<string, number>();
    let corruptFiles = 0;
    for (const request of requests) {
      const expectedArtifact = expectedArtifactFor(request.url, device);
      if (!expectedArtifact || cachedByKey.has(expectedArtifact.key)) continue;
      const response = await cache.match(request);
      if (!response) continue;
      const measured = await responseSha256(response.clone());
      if (measured.digest !== expectedArtifact.artifact.sha256) corruptFiles += 1;
      const headerBytes = response?.headers.get('content-length');
      const parsedBytes = headerBytes ? Number(headerBytes) : Number.NaN;
      cachedByKey.set(expectedArtifact.key, Number.isFinite(parsedBytes) && parsedBytes > 0 ? parsedBytes : measured.bytes);
    }
    const cachedFiles = cachedByKey.size;
    return {
      status: corruptFiles > 0 ? 'corrupt' : cachedFiles === 0 ? 'not-cached' : cachedFiles === expected.length ? 'cached' : 'partial',
      bytes: [...cachedByKey.values()].reduce((total, bytes) => total + bytes, 0),
      cachedFiles,
      expectedFiles: expected.length,
      corruptFiles
    };
  } catch {
    return { ...emptyReport('unknown'), expectedFiles: expected.length };
  }
}

export async function deleteSpeechModelCache(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  try {
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
    const requests = await cache.keys();
    let deleted = 0;
    for (const request of requests) {
      if (isOwnedArtifactUrl(request.url) && await cache.delete(request)) deleted += 1;
    }
    return deleted;
  } catch {
    return 0;
  }
}