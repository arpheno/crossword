import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const swSource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sw.js'), 'utf8');

type Listener = (event: unknown) => void;

interface Harness {
  cacheNames: Map<string, Map<string, Response>>;
  listeners: Record<string, Listener[]>;
  skipWaiting: ReturnType<typeof vi.fn>;
  clientsClaim: ReturnType<typeof vi.fn>;
  sandboxFetch: ReturnType<typeof vi.fn>;
}

const ORIGIN = 'https://crossword.example';

function installWorker(source: string, precache: readonly string[] = ['/index.html']): Harness {
  const cacheNames = new Map<string, Map<string, Response>>();
  const listeners: Record<string, Listener[]> = {};
  const skipWaiting = vi.fn(async () => undefined);
  const clientsClaim = vi.fn(async () => undefined);
  const sandboxFetch = vi.fn(async () => new Response('network'));
  const matchUrl = (request: Request | string): URL =>
    typeof request === 'string' ? new URL(request, ORIGIN) : new URL(request.url);
  const cachesStub = {
    async open(name: string) {
      let cache = cacheNames.get(name);
      if (!cache) {
        cache = new Map<string, Response>();
        cacheNames.set(name, cache);
      }
      return {
        addAll: async (urls: readonly string[]) => {
          for (const url of urls) cache!.set(url, new Response('fixture'));
        },
        match: async (request: Request | string) => {
          const url = matchUrl(request);
          return cache!.get(url.pathname + url.search);
        },
        put: async (request: Request, response: Response) => {
          cache!.set(new URL(request.url).pathname, response);
        },
        keys: async () => [...cache!.keys()].map((url) => ({ url })),
        delete: async (request: Request) => cache!.delete(new URL(request.url).pathname)
      };
    },
    async keys() {
      return [...cacheNames.keys()];
    },
    async match(request: Request | string) {
      const url = matchUrl(request);
      for (const cache of cacheNames.values()) {
        const hit = cache.get(url.pathname);
        if (hit) return hit;
      }
      return undefined;
    },
    async delete(name: string) {
      return cacheNames.delete(name);
    }
  };
  const sandbox = {
    self: {
      addEventListener: (type: string, listener: Listener) => {
        listeners[type] = listeners[type] ?? [];
        listeners[type].push(listener);
      },
      __CROSSWORD_PRECACHE__: precache,
      skipWaiting,
      location: new URL(ORIGIN + '/'),
      clients: { claim: clientsClaim }
    },
    caches: cachesStub,
    fetch: sandboxFetch,
    URL,
    Response,
    Request,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return { cacheNames, listeners, skipWaiting, clientsClaim, sandboxFetch };
}

async function runInstall(harness: Harness): Promise<void> {
  const waiters: Promise<unknown>[] = [];
  const event = { waitUntil: (promise: Promise<unknown>) => { waiters.push(promise); } };
  for (const listener of harness.listeners.install ?? []) listener(event);
  await Promise.all(waiters);
}

async function runActivate(harness: Harness): Promise<void> {
  const waiters: Promise<unknown>[] = [];
  const event = { waitUntil: (promise: Promise<unknown>) => { waiters.push(promise); } };
  for (const listener of harness.listeners.activate ?? []) listener(event);
  await Promise.all(waiters);
}

interface FetchOutcome {
  answered: Response | undefined;
  failure: string | undefined;
}

async function runFetch(harness: Harness, request: { url: string; method: string; mode: string }): Promise<FetchOutcome> {
  const outcome: FetchOutcome = { answered: undefined, failure: undefined };
  const event = {
    request,
    mode: request.mode,
    waitUntil: () => undefined,
    respondWith: (promise: Promise<Response>) => {
      void promise.then(
        (response) => { outcome.answered = response; },
        (error: unknown) => { outcome.failure = error instanceof Error ? error.message : String(error); }
      );
    }
  };
  for (const listener of harness.listeners.fetch ?? []) listener(event);
  await new Promise((resolve) => setTimeout(resolve, 10));
  return outcome;
}

function goOffline(harness: Harness): void {
  harness.sandboxFetch.mockImplementation(async () => {
    throw new Error('offline');
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('service worker cache ownership (PO-P0-1, ADR 0006)', () => {
  it('activation deletes only obsolete shell caches it owns', async () => {
    const harness = installWorker(swSource);
    harness.cacheNames.set('crossword-shell-v3', new Map([['/index.html', new Response('old')]]));
    harness.cacheNames.set('crossword-shell-v4', new Map([['/index.html', new Response('current')]]));
    harness.cacheNames.set('transformers-cache', new Map([['speech', new Response('speech')]]));
    harness.cacheNames.set('webllm/model', new Map([['weights', new Response('weights')]]));
    harness.cacheNames.set('unrelated-foreign-cache', new Map([['x', new Response('x')]]));

    await runActivate(harness);

    expect(harness.cacheNames.has('crossword-shell-v3')).toBe(false);
    expect(harness.cacheNames.has('crossword-shell-v4')).toBe(true);
    expect(harness.cacheNames.has('transformers-cache')).toBe(true);
    expect(harness.cacheNames.has('webllm/model')).toBe(true);
    expect(harness.cacheNames.has('unrelated-foreign-cache')).toBe(true);
  });

  it('install precaches the injected manifest and the shell', async () => {
    const precache = ['/', '/index.html', '/assets/index-BoOt.js', '/data/fill-lexicon-v1.txt'];
    const harness = installWorker(swSource, precache);

    await runInstall(harness);

    const shell = harness.cacheNames.get('crossword-shell-v4');
    for (const url of precache) {
      expect(shell?.has(url)).toBe(true);
    }
    expect(harness.skipWaiting).toHaveBeenCalled();
  });
});

describe('service worker offline behavior (PO-P0-2)', () => {
  it('never answers a missing module request with the navigation fallback', async () => {
    const harness = installWorker(swSource, ['/index.html']);
    await runInstall(harness);
    goOffline(harness);

    // jsdom's Request cannot express worker fetch modes; the worker only
    // reads url/method/mode, so a structural request mock is exact here.
    const outcome = await runFetch(harness, { url: ORIGIN + '/assets/missing-module-AbC.js', method: 'GET', mode: 'same-origin' });

    expect(outcome.answered).toBeUndefined();
    expect(outcome.failure).toBe('offline');
  });

  it('answers navigation requests from the cached shell when offline', async () => {
    const harness = installWorker(swSource, ['/index.html']);
    await runInstall(harness);
    goOffline(harness);

    const outcome = await runFetch(harness, { url: ORIGIN + '/', method: 'GET', mode: 'navigate' });

    expect(outcome.answered).toBeDefined();
    expect(outcome.failure).toBeUndefined();
  });
});