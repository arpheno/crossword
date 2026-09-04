import { describe, expect, it, vi } from 'vitest';
import type { ModelManifest } from './broker';
import { createWebLLMAdapter, type WebLlmEngine, type WebLlmModule } from './webllmAdapter';

const manifest: ModelManifest = {
  schemaVersion: 1,
  id: 'fixture-model',
  version: '1',
  quantization: 'q4f16_1',
  runtimeVersion: 'webllm-fixture',
  promptVersion: 'candidate-v1',
  minimumMemoryMb: 1,
  shards: [],
  distribution: 'webllm-mlc'
};

class FakeEngineWorker {
  terminatedCount = 0;
  terminate(): void { this.terminatedCount += 1; }
}

function fakeEngine(): WebLlmEngine {
  return {
    chat: { completions: { create: vi.fn(async () => ({ choices: [{ message: { content: '[]' } }] })) } },
    unload: vi.fn(async () => undefined),
    interruptGenerate: vi.fn(() => undefined)
  } as unknown as WebLlmEngine;
}

function fakeModule(engineFactory: () => Promise<WebLlmEngine>): WebLlmModule {
  return {
    prebuiltAppConfig: { model_list: [{ model_id: 'fixture-model' }] },
    CreateWebWorkerMLCEngine: () => engineFactory()
  } as unknown as WebLlmModule;
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

interface Harness {
  adapter: ReturnType<typeof createWebLLMAdapter>;
  workers: FakeEngineWorker[];
  engines: WebLlmEngine[];
}

function harness(engineFactory: () => Promise<WebLlmEngine>): Harness {
  const workers: FakeEngineWorker[] = [];
  const engines: WebLlmEngine[] = [];
  let attempt = 0;
  const adapter = createWebLLMAdapter({
    loadModule: async () => {
      attempt += 1;
      return fakeModule(attempt === 1 ? engineFactory : async () => engines[engines.length - 1] ?? fakeEngine());
    },
    createWorker: () => {
      const worker = new FakeEngineWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    }
  });
  return { adapter, workers, engines };
}

// ADR 0004 §8: adapter teardown is idempotent and leak-free; the default
// engine path owns a nested worker that must be terminated with the engine.
describe('WebLLM adapter resource ownership', () => {
  it('terminates the nested engine worker exactly once on unload', async () => {
    const engine = fakeEngine();
    const workers: FakeEngineWorker[] = [];
    const adapter = createWebLLMAdapter({
      loadModule: async () => fakeModule(async () => engine),
      createWorker: () => {
        const worker = new FakeEngineWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      }
    });

    await adapter.install(manifest);
    expect(workers).toHaveLength(1);
    await adapter.unload();

    expect(engine.unload).toHaveBeenCalledTimes(1);
    expect(workers[0]!.terminatedCount).toBe(1);
  });

  it('keeps live worker count flat across repeated prepare/unload cycles', async () => {
    const workers: FakeEngineWorker[] = [];
    const unloadSpies: Array<ReturnType<typeof vi.fn>> = [];
    const adapter = createWebLLMAdapter({
      loadModule: async () => fakeModule(async () => {
        const engine = fakeEngine();
        unloadSpies.push(engine.unload as unknown as ReturnType<typeof vi.fn>);
        return engine;
      }),
      createWorker: () => {
        const worker = new FakeEngineWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      }
    });

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await adapter.install(manifest);
      await adapter.unload();
    }

    expect(workers).toHaveLength(3);
    expect(workers.every((worker) => worker.terminatedCount === 1)).toBe(true);
    expect(unloadSpies).toHaveLength(3);
  });

  it('does not create a second engine when a prepare runs against a resident engine', async () => {
    const engine = fakeEngine();
    const workers: FakeEngineWorker[] = [];
    const adapter = createWebLLMAdapter({
      loadModule: async () => fakeModule(async () => engine),
      createWorker: () => {
        const worker = new FakeEngineWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      }
    });

    await adapter.install(manifest);
    await adapter.install(manifest);
    await adapter.load(manifest);

    expect(workers).toHaveLength(1);
    expect(engine.unload).not.toHaveBeenCalled();
  });

  it('rejects promptly, disposes the attempt, and recovers when aborted during creation', async () => {
    const gate = deferred<WebLlmEngine>();
    const replacement = fakeEngine();
    const engines = [replacement];
    let engineCalls = 0;
    const workers: FakeEngineWorker[] = [];
    const adapter = createWebLLMAdapter({
      // The default engine path loads the module per prepare; count ENGINE
      // creations, not module loads: first creation parks on the gate, the
      // recovery creation resolves with the replacement engine.
      loadModule: async () => fakeModule(() => {
        engineCalls += 1;
        return engineCalls === 1 ? gate.promise : Promise.resolve(engines[0]!);
      }),
      createWorker: () => {
        const worker = new FakeEngineWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      }
    });
    const controller = new AbortController();

    const install = adapter.install(manifest, controller.signal);
    // Wait until the creation attempt is parked on the engine gate so the
    // abort lands against a live creation, not against module loading.
    await vi.waitFor(() => expect(workers.length).toBe(1));
    controller.abort();
    gate.reject(new Error('engine worker stopped'));

    await expect(install).rejects.toThrow(/cancelled/i);
    expect(workers[0]!.terminatedCount).toBe(1);

    // A fresh prepare must be able to create a fresh engine and worker.
    await adapter.load(manifest);
    expect(workers).toHaveLength(2);
    expect(workers[1]!.terminatedCount).toBe(0);
  });

  it('disposes a just-created resident engine when the signal aborts after creation', async () => {
    const engine = fakeEngine();
    const gate = deferred<WebLlmEngine>();
    const workers: FakeEngineWorker[] = [];
    const adapter = createWebLLMAdapter({
      loadModule: async () => fakeModule(() => gate.promise),
      createWorker: () => {
        const worker = new FakeEngineWorker();
        workers.push(worker);
        return worker as unknown as Worker;
      }
    });
    const controller = new AbortController();

    const install = adapter.install(manifest, controller.signal);
    // Park the creation on the engine gate, then resolve it and abort in the
    // same synchronous block: the adapter observes a completed creation with
    // an aborted signal and must still dispose the resident engine.
    await vi.waitFor(() => expect(workers.length).toBe(1));
    gate.resolve(engine);
    controller.abort();
    await expect(install).rejects.toThrow(/cancelled/i);

    // The late rescue disposes the produced engine a few microtasks later.
    await vi.waitFor(() => expect(engine.unload).toHaveBeenCalledTimes(1));
    expect(workers[0]!.terminatedCount).toBe(1);
  });
});