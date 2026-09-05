import { describe, expect, it, vi } from 'vitest';

import { createWasmFillEngine, type WasmEngineHandle, type WasmEngineModule, type WasmSolveHandle, type WasmStep } from './wasmFillEngine';
import type { FillRequest, FillResult } from '../csp';

const request: FillRequest = {
  slots: [{ id: 'slot', length: 3 }],
  intersections: [],
  candidates: [{ word: 'CAT', score: 1, lexemeId: 'cat', sourceIds: ['fixture'] }]
};

const result: FillResult = {
  status: 'solved',
  solution: {
    assignments: { slot: request.candidates[0]! },
    score: 1,
    nodes: 1
  },
  termination: 'exhausted',
  terminationReason: 'exhausted',
  provenOptimal: true,
  nodesExplored: 1,
  bestBound: 1,
  gap: 0
};

function moduleFor(engine: WasmEngineHandle, version = 'fill-v1'): WasmEngineModule {
  return { contractVersion: () => version, Engine: class { constructor() { return engine; } } as unknown as WasmEngineModule['Engine'] };
}

function solveHandle(steps: WasmStep[]): WasmSolveHandle {
  return {
    step: vi.fn(async (): Promise<WasmStep> => steps.shift() ?? { state: 'finished', result }),
    cancel: vi.fn(),
    dropSolve: vi.fn()
  };
}

describe('Wasm fill adapter', () => {
  it('rejects an ABI/contract mismatch before constructing an engine', async () => {
    const constructor = vi.fn();
    const module = { contractVersion: () => 'fill-v0', Engine: constructor } as unknown as WasmEngineModule;
    await expect(createWasmFillEngine(async () => module)).rejects.toThrow('Unsupported fill contract version');
    expect(constructor).not.toHaveBeenCalled();
  });

  it('forwards progress, validates the final result, and tears down the solve', async () => {
    const solve = solveHandle([
      { state: 'running', progress: { type: 'progress', nodes: 1, assigned: 0, openSlots: 1, bestScore: Number.NEGATIVE_INFINITY } },
      { state: 'finished', result }
    ]);
    const dropEngine = vi.fn();
    const engine = { startSolve: vi.fn(() => solve), dropEngine };
    const adapter = await createWasmFillEngine(async () => moduleFor(engine));
    const progress: number[] = [];
    await expect(adapter.solve(request, { onProgress: (event) => progress.push(event.nodes) })).resolves.toEqual(result);
    expect(progress).toEqual([1]);
    expect(solve.dropSolve).toHaveBeenCalledOnce();
    adapter.dispose();
    adapter.dispose();
    expect(dropEngine).toHaveBeenCalledOnce();
  });

  it('rejects malformed output and still drops the solve handle', async () => {
    const solve = solveHandle([{ state: 'finished', result: { status: 'solved' } }]);
    const adapter = await createWasmFillEngine(async () => moduleFor({ startSolve: () => solve }));
    await expect(adapter.solve(request)).rejects.toThrow('Malformed Wasm fill result');
    expect(solve.dropSolve).toHaveBeenCalledOnce();
  });

  it('cancels between chunks and returns the typed cancellation result', async () => {
    const controller = new AbortController();
    const solve = solveHandle([
      { state: 'running', progress: { type: 'progress', nodes: 1, assigned: 0, openSlots: 1, bestScore: Number.NEGATIVE_INFINITY } },
      { state: 'finished', result: {
        status: 'failed',
        failure: { code: 'cancelled', message: 'Fill search cancelled', nodes: 1 },
        termination: 'cancelled',
        terminationReason: 'cancelled',
        nodesExplored: 1
      } }
    ]);
    const adapter = await createWasmFillEngine(async () => moduleFor({ startSolve: () => solve }));
    const promise = adapter.solve(request, {
      signal: controller.signal,
      onProgress: () => controller.abort()
    });
    await expect(promise).resolves.toMatchObject({ status: 'failed', termination: 'cancelled' });
    expect(solve.cancel).toHaveBeenCalledOnce();
  });

  it('returns cancellation without creating a Wasm solve when already aborted', async () => {
    const solve = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const adapter = await createWasmFillEngine(async () => moduleFor({ startSolve: solve }));
    await expect(adapter.solve(request, { signal: controller.signal })).resolves.toMatchObject({
      status: 'failed',
      failure: { code: 'cancelled' }
    });
    expect(solve).not.toHaveBeenCalled();
  });
});
