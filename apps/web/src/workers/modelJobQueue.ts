import type { BrokerResult, ModelState, ModelWorkerOperation, ModelWorkerResponse } from '@crossword/model-runtime';

/**
 * Single-command arbiter for the model worker (ADR 0004 §4). WebLLM is a
 * scarce single-engine resource, so commands run strictly one at a time in
 * arrival order. Cancelling a queued job settles it immediately without
 * running; cancelling a running job aborts its signal and lets the broker
 * surface the cancellation.
 */
export type ModelJob = Readonly<{
  requestId: string;
  operation: ModelWorkerOperation;
  payload: unknown;
}>;

export type ModelJobRunner = (job: Readonly<{ requestId: string; operation: ModelWorkerOperation; payload: unknown; signal: AbortSignal }>) => Promise<BrokerResult<unknown>>;

export type ModelJobQueue = Readonly<{
  enqueue: (job: ModelJob) => void;
  cancel: (requestId: string) => void;
  has: (requestId: string) => boolean;
  isIdle: () => boolean;
}>;

type InternalJob = {
  requestId: string;
  operation: ModelWorkerOperation;
  payload: unknown;
  controller: AbortController;
  cancelled: boolean;
};

function cancelledResult(): BrokerResult<undefined> {
  return { ok: false, error: { code: 'cancelled', message: 'Model request cancelled before it started' } };
}

export function createModelJobQueue(
  post: (message: ModelWorkerResponse) => void,
  run: ModelJobRunner,
  getState: () => ModelState | undefined
): ModelJobQueue {
  const waiting: InternalJob[] = [];
  let running: InternalJob | null = null;

  const postState = () => {
    const state = getState();
    if (state) post({ version: 1, type: 'state', state });
  };

  const pump = (): void => {
    if (running) return;
    const next = waiting.shift();
    if (!next) return;
    if (next.cancelled) {
      post({ version: 1, type: 'result', requestId: next.requestId, operation: next.operation, result: cancelledResult() });
      pump();
      return;
    }
    running = next;
    void run({ requestId: next.requestId, operation: next.operation, payload: next.payload, signal: next.controller.signal }).then((result) => {
      post({ version: 1, type: 'result', requestId: next.requestId, operation: next.operation, result });
      postState();
    }).catch((error: unknown) => {
      post({ version: 1, type: 'protocol-error', requestId: next.requestId, message: error instanceof Error ? error.message : 'Model worker operation failed' });
      postState();
    }).finally(() => {
      running = null;
      pump();
    });
  };

  return {
    enqueue(job) {
      if (running?.requestId === job.requestId || waiting.some((entry) => entry.requestId === job.requestId)) {
        post({ version: 1, type: 'protocol-error', requestId: job.requestId, message: 'Model request is already running' });
        return;
      }
      waiting.push({ requestId: job.requestId, operation: job.operation, payload: job.payload, controller: new AbortController(), cancelled: false });
      pump();
    },
    cancel(requestId) {
      if (running?.requestId === requestId) {
        running.controller.abort();
        return;
      }
      const index = waiting.findIndex((entry) => entry.requestId === requestId);
      if (index === -1) return;
      const [entry] = waiting.splice(index, 1);
      if (!entry) return;
      entry.cancelled = true;
      post({ version: 1, type: 'result', requestId: entry.requestId, operation: entry.operation, result: cancelledResult() });
    },
    has: (requestId) => running?.requestId === requestId || waiting.some((entry) => entry.requestId === requestId),
    isIdle: () => running === null && waiting.length === 0
  };
}