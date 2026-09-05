import { solveFillAsync } from '../csp';
import type { FillEngine, FillEngineOptions } from './fillEngine';
import type { FillRequest, FillResult } from '../csp';

/** Reference/fallback engine. It owns no resources beyond one solve call. */
export class TsFillEngine implements FillEngine {
  solve(request: FillRequest, options: FillEngineOptions = {}): Promise<FillResult> {
    return solveFillAsync(request, options);
  }

  dispose(): void {
    // The TypeScript engine has no retained worker/module handle.
  }
}
