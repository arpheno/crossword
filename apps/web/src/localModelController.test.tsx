// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrokerResult, ModelProgress, ModelState } from '@crossword/model-runtime';
import type { ModelWorkerClient } from './workers/modelClient';
import { useLocalModelController, type LocalModelController } from './localModelController';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('./workers/modelClient', () => ({ createBrowserModelWorkerClient: createClient }));

type FakeClient = ModelWorkerClient & {
  emitProgress: (event: ModelProgress) => void;
  emitState: (state: ModelState) => void;
  completeInstall: () => void;
};

function ok<T>(value: T): BrokerResult<T> { return { ok: true, value }; }

function fakeClient(options: { cached?: boolean; failInstall?: boolean } = {}): FakeClient {
  let currentState: ModelState = 'uninstalled';
  const progressListeners = new Set<(event: ModelProgress) => void>();
  const stateListeners = new Set<(state: ModelState) => void>();
  const install = vi.fn(async (signal?: AbortSignal) => {
    if (options.failInstall) return { ok: false, error: { code: 'runtime-error', message: 'Fixture download failed' } } as const;
    progressListeners.forEach((listener) => listener({ phase: 'downloading', progress: 0.5, text: 'Fetching fixture' }));
    await Promise.resolve();
    if (signal?.aborted) return { ok: false, error: { code: 'cancelled', message: 'Model installation cancelled' } } as const;
    currentState = 'installed';
    stateListeners.forEach((listener) => listener(currentState));
    return ok(undefined);
  });
  const client: FakeClient = {
    configure: vi.fn(async () => ok(undefined)),
    inspectCache: vi.fn(async () => ok(options.cached === true)),
    install,
    load: vi.fn(async () => { currentState = 'loaded'; stateListeners.forEach((listener) => listener(currentState)); return ok(undefined); }),
    generateCandidates: vi.fn(async () => ok([])),
    resolveSpokenAnswer: vi.fn(async () => ok([])),
    composeClues: vi.fn(async () => ok([])),
    unload: vi.fn(async () => { currentState = 'installed'; stateListeners.forEach((listener) => listener(currentState)); return ok(undefined); }),
    deleteCache: vi.fn(async () => { currentState = 'uninstalled'; stateListeners.forEach((listener) => listener(currentState)); return ok(undefined); }),
    state: () => currentState,
    subscribeProgress: (listener) => { progressListeners.add(listener); return () => progressListeners.delete(listener); },
    subscribeState: (listener) => { stateListeners.add(listener); return () => stateListeners.delete(listener); },
    cancel: vi.fn(),
    dispose: vi.fn(),
    emitProgress: (event) => progressListeners.forEach((listener) => listener(event)),
    emitState: (state) => { currentState = state; stateListeners.forEach((listener) => listener(state)); },
    completeInstall: () => undefined
  };
  return client;
}

describe('local model controller', () => {
  let controller: LocalModelController | undefined;
  let root: ReturnType<typeof createRoot>;
  let host: HTMLDivElement;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    createClient.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    function Harness() {
      controller = useLocalModelController();
      return null;
    }
    root = createRoot(host);
    act(() => { root.render(<Harness />); });
  });

  it('inspects cache without downloading and prepares a cached model with honest runtime progress', async () => {
    const client = fakeClient({ cached: true });
    createClient.mockReturnValue(client);
    await act(async () => { await controller?.inspectCache(); });
    expect(controller?.snapshot.cacheStatus).toBe('cached');
    expect(client.install).not.toHaveBeenCalled();

    await act(async () => { await controller?.prepare({ type: 'settings' }); });
    expect(client.install).toHaveBeenCalled();
    expect(client.load).toHaveBeenCalled();
    expect(controller?.snapshot.phase).toBe('ready');
    expect(controller?.snapshot.brokerState).toBe('loaded');
  });

  it('keeps cancellation and failures visible, then supports retry and cache deletion', async () => {
    const client = fakeClient({ cached: false });
    createClient.mockReturnValue(client);
    let pending: Promise<boolean> | undefined;
    await act(async () => {
      pending = controller?.prepare({ type: 'construction', day: 'monday' });
      await Promise.resolve();
      controller?.cancel();
      await pending;
    });
    expect(controller?.snapshot.phase).toBe('cancelled');
    expect(controller?.snapshot.error?.code).toBe('cancelled');

    await act(async () => { controller?.dismissError(); });
    expect(controller?.snapshot.error).toBeNull();
    await act(async () => { await controller?.deleteCache(); });
    expect(client.deleteCache).toHaveBeenCalled();
    expect(controller?.snapshot.cacheStatus).toBe('not-cached');
  });

  it('unloads a ready model while retaining its browser cache', async () => {
    const client = fakeClient({ cached: true });
    createClient.mockReturnValue(client);
    await act(async () => { await controller?.inspectCache(); });
    await act(async () => { await controller?.prepare({ type: 'settings' }); });
    await act(async () => { await controller?.unload(); });
    expect(controller?.snapshot.phase).toBe('idle');
    expect(controller?.snapshot.cacheStatus).toBe('cached');
    expect(client.unload).toHaveBeenCalled();
  });
});
