import type { FillProgress, FillRequest, FillResult } from '../csp';

export type FillEngineOptions = Readonly<{
  signal?: AbortSignal;
  onProgress?: (progress: FillProgress) => void;
}>;

export interface FillEngine {
  solve(request: FillRequest, options?: FillEngineOptions): Promise<FillResult>;
  dispose(): void;
}

export const FILL_CONTRACT_VERSION = 'fill-v1';
