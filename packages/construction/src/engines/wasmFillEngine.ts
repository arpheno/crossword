import { parseConstructorWorkerResponse } from '../workerProtocol';
import type { FillProgress, FillRequest, FillResult } from '../csp';
import { FILL_CONTRACT_VERSION, type FillEngine, type FillEngineOptions } from './fillEngine';

export type WasmStep = Readonly<
  | { state: 'running'; progress: FillProgress }
  | { state: 'finished'; result: unknown }
>;

export interface WasmSolveHandle {
  step(nodeBudget: number): WasmStep | Promise<WasmStep>;
  cancel(): void;
  dropSolve(): void;
}

export interface WasmEngineHandle {
  startSolve(request: FillRequest): WasmSolveHandle;
  dropEngine?(): void;
}

export interface WasmEngineModule {
  contractVersion(): string;
  Engine: new (contractVersion: string) => WasmEngineHandle;
}

export type WasmModuleLoader = () => Promise<WasmEngineModule>;

/**
 * Adapter for the generated wasm-bindgen surface. The worker remains the
 * lifecycle owner; this class only translates coarse step results and rejects
 * malformed Wasm output before it reaches application code.
 */
export class WasmFillEngine implements FillEngine {
  private disposed = false;

  constructor(private readonly engine: WasmEngineHandle) {}

  async solve(request: FillRequest, options: FillEngineOptions = {}): Promise<FillResult> {
    if (this.disposed) throw new Error('Wasm fill engine is disposed');
    if (options.signal?.aborted) {
      return cancelledResult();
    }
    const solve = this.engine.startSolve(request);
    try {
      while (true) {
        if (options.signal?.aborted) solve.cancel();
        const step = await solve.step(32);
        if (step.state === 'running') {
          options.onProgress?.(step.progress);
          continue;
        }
        if (step.state !== 'finished') throw new Error('Malformed Wasm step state');
        const response = parseConstructorWorkerResponse({
          version: 1,
          type: 'result',
          jobId: 'wasm-fill',
          result: step.result
        });
        if (!response || response.type !== 'result') {
          throw new Error('Malformed Wasm fill result');
        }
        return response.result;
      }
    } finally {
      solve.dropSolve();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.engine.dropEngine?.();
  }
}

export async function createWasmFillEngine(loader: WasmModuleLoader): Promise<WasmFillEngine> {
  const module = await loader();
  if (module.contractVersion() !== FILL_CONTRACT_VERSION) {
    throw new Error('Unsupported fill contract version');
  }
  return new WasmFillEngine(new module.Engine(FILL_CONTRACT_VERSION));
}

function cancelledResult(): FillResult {
  return {
    status: 'failed',
    failure: { code: 'cancelled', message: 'Fill search cancelled', nodes: 0 },
    termination: 'cancelled',
    terminationReason: 'cancelled',
    nodesExplored: 0
  };
}
