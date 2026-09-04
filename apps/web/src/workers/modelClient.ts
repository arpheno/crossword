import {
  parseModelWorkerResponse,
  type BrokerResult,
  type CandidateRequest,
  type CandidateSuggestion,
  type ClueDraft,
  type ModelFailureCode,
  type ModelManifest,
  type ModelProgress,
  type ModelState,
  type ModelWorkerConfig,
  type ModelWorkerOperation,
  type ModelWorkerRequest,
  type RuntimeProbe,
  type SpokenAnswerRequest,
  type SpokenAnswerCandidate
} from '@crossword/model-runtime';

/** Grace period before a cooperative cancel forces worker replacement (ADR 0004 §6). */
export const DEFAULT_CANCEL_GRACE_MS = 8_000;

export type ModelClientFailureCode = 'worker-fatal' | 'disposed' | 'cancelled' | 'protocol';

/** Typed client-side failure (ADR 0004 §5). Fatal conditions are recoverable only by constructing a fresh client. */
export class ModelClientError extends Error {
  readonly code: ModelClientFailureCode;

  constructor(code: ModelClientFailureCode, message: string) {
    super(message);
    this.name = 'ModelClientError';
    this.code = code;
  }
}

export type ModelOperationStatus = 'running' | 'succeeded' | 'cancelled' | 'failed';

/** Request-scoped operation event. Exactly one terminal event is emitted per operation. */
export type ModelOperationEvent = Readonly<{
  requestId: string;
  operation: ModelWorkerOperation | 'configure';
  status: ModelOperationStatus;
  progress?: ModelProgress;
  error?: Readonly<{ code: ModelFailureCode | ModelClientFailureCode; message: string }>;
}>;

export interface ModelWorkerClient {
  configure(config: ModelWorkerConfig): Promise<BrokerResult<void>>;
  inspectCache(): Promise<BrokerResult<boolean>>;
  install(signal?: AbortSignal): Promise<BrokerResult<void>>;
  load(signal?: AbortSignal): Promise<BrokerResult<void>>;
  generateCandidates(request: CandidateRequest, signal?: AbortSignal): Promise<BrokerResult<readonly CandidateSuggestion[]>>;
  resolveSpokenAnswer(request: SpokenAnswerRequest, signal?: AbortSignal): Promise<BrokerResult<readonly SpokenAnswerCandidate[]>>;
  composeClues(request: Readonly<{ answer: string; intendedSense: string }>, signal?: AbortSignal): Promise<BrokerResult<readonly ClueDraft[]>>;
  unload(signal?: AbortSignal): Promise<BrokerResult<void>>;
  deleteCache(signal?: AbortSignal): Promise<BrokerResult<void>>;
  state(): ModelState;
  /** @deprecated Unscoped progress bridge; consumers migrate to {@link subscribeOperations}. Removal is owned by the App integration increment. */
  subscribeProgress(listener: (progress: ModelProgress) => void): () => void;
  subscribeState(listener: (state: ModelState) => void): () => void;
  subscribeOperations(listener: (event: ModelOperationEvent) => void): () => void;
  cancel(requestId: string, options?: { graceMs?: number }): void;
  isFatal(): boolean;
  dispose(): void;
}

type PendingJob = {
  operation: ModelWorkerOperation | 'configure';
  resolve: (result: BrokerResult<unknown>) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  cancelTimer?: ReturnType<typeof setTimeout>;
};

export type ModelWorkerClientOptions = Readonly<{
  onFatal?: () => void;
  cancelGraceMs?: number;
}>;

function responseRequestId(value: unknown): string | undefined {
  return typeof value === 'object' && value !== null && 'requestId' in value && typeof value.requestId === 'string' ? value.requestId : undefined;
}

function terminalStatus(result: BrokerResult<unknown>): ModelOperationStatus {
  if (result.ok) return 'succeeded';
  return result.error.code === 'cancelled' ? 'cancelled' : 'failed';
}

export function createModelWorkerClient(worker: Worker, options: ModelWorkerClientOptions = {}): ModelWorkerClient {
  const pending = new Map<string, PendingJob>();
  const operationListeners = new Set<(event: ModelOperationEvent) => void>();
  const progressListeners = new Set<(progress: ModelProgress) => void>();
  const stateListeners = new Set<(state: ModelState) => void>();
  let nextRequestId = 1;
  let currentState: ModelState = 'uninstalled';
  let fatal = false;
  const graceMs = options.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS;

  const emitOperation = (event: ModelOperationEvent) => {
    for (const listener of operationListeners) listener(event);
  };

  const emitTerminal = (requestId: string, operation: PendingJob['operation'], status: ModelOperationStatus, error?: ModelOperationEvent['error']) => {
    emitOperation(error === undefined ? { requestId, operation, status } : { requestId, operation, status, error });
  };

  const clearJob = (job: PendingJob) => {
    if (job.cancelTimer) clearTimeout(job.cancelTimer);
    if (job.signal && job.onAbort) job.signal.removeEventListener('abort', job.onAbort);
  };

  const settle = (requestId: string, action: (job: PendingJob) => void) => {
    const job = pending.get(requestId);
    if (!job) return;
    pending.delete(requestId);
    clearJob(job);
    action(job);
  };

  const rejectAll = (error: Error, terminal?: { status: ModelOperationStatus; errorCode: string }) => {
    for (const requestId of [...pending.keys()]) {
      settle(requestId, (job) => {
        if (terminal) emitTerminal(requestId, job.operation, terminal.status, { code: terminal.errorCode as ModelFailureCode | ModelClientFailureCode, message: error.message });
        job.reject(error);
      });
    }
  };

  const markFatal = (message: string) => {
    if (fatal) return;
    fatal = true;
    rejectAll(new ModelClientError('worker-fatal', message), { status: 'failed', errorCode: 'worker-fatal' });
    options.onFatal?.();
  };

  const handleMessage = (event: MessageEvent<unknown>) => {
    const message = parseModelWorkerResponse(event.data);
    if (!message) {
      const requestId = responseRequestId(event.data);
      if (requestId) settle(requestId, (job) => job.reject(new ModelClientError('protocol', 'Invalid model worker response')));
      else rejectAll(new ModelClientError('protocol', 'Invalid model worker response'));
      return;
    }
    if (message.type === 'state') {
      currentState = message.state;
      stateListeners.forEach((listener) => listener(currentState));
      return;
    }
    if (message.type === 'progress') {
      // Request-scoped routing (ADR 0004 §3): progress without a live
      // operation is stale and dropped, never replayed to consumers.
      const job = pending.get(message.requestId);
      if (!job) return;
      emitOperation({ requestId: message.requestId, operation: job.operation, status: 'running', progress: message.progress });
      progressListeners.forEach((listener) => listener(message.progress));
      return;
    }
    if (message.type === 'result') {
      const job = pending.get(message.requestId);
      if (job && job.operation !== message.operation) {
        settle(message.requestId, (pendingJob) => pendingJob.reject(new ModelClientError('protocol', 'Model worker response operation mismatch')));
        return;
      }
      settle(message.requestId, (pendingJob) => {
        const result = message.result;
        emitTerminal(message.requestId, pendingJob.operation, terminalStatus(result), result.ok ? undefined : { code: result.error.code, message: result.error.message });
        pendingJob.resolve(result);
      });
      return;
    }
    if (message.requestId) {
      const requestId = message.requestId;
      settle(requestId, (job) => {
        emitTerminal(requestId, job.operation, 'failed', { code: 'protocol', message: message.message });
        job.reject(new ModelClientError('protocol', message.message));
      });
      return;
    }
    markFatal(message.message);
  };

  const handleError = () => markFatal('Model worker stopped unexpectedly');
  worker.addEventListener('message', handleMessage);
  worker.addEventListener('error', handleError);

  const hardCancel = (requestId: string) => {
    const job = pending.get(requestId);
    if (!job) return;
    // Cooperative cancellation expired: replace the worker (ADR 0004 §6).
    fatal = true;
    worker.terminate();
    settle(requestId, (target) => {
      emitTerminal(requestId, target.operation, 'cancelled', { code: 'cancelled', message: 'Model operation cancelled after the cooperative deadline elapsed' });
      target.reject(new ModelClientError('cancelled', 'Model operation cancelled after the cooperative deadline elapsed'));
    });
    rejectAll(new ModelClientError('worker-fatal', 'Model worker was replaced after a cancellation deadline'), { status: 'failed', errorCode: 'worker-fatal' });
    options.onFatal?.();
  };

  const sendCancel = (requestId: string, grace?: number) => {
    const job = pending.get(requestId);
    if (!job) return;
    worker.postMessage({ version: 1, type: 'cancel', requestId } satisfies ModelWorkerRequest);
    if (job.cancelTimer) clearTimeout(job.cancelTimer);
    job.cancelTimer = setTimeout(() => hardCancel(requestId), grace ?? graceMs);
  };

  const refuseIfFatal = (): Error | null => {
    return fatal ? new ModelClientError('worker-fatal', 'Model worker stopped unexpectedly') : null;
  };

  const run = <T>(operation: ModelWorkerOperation, payload: CandidateRequest | SpokenAnswerRequest | Readonly<{ answer: string; intendedSense: string }> | undefined, signal?: AbortSignal): Promise<BrokerResult<T>> => {
    const refused = refuseIfFatal();
    if (refused) return Promise.reject(refused);
    const requestId = `model-${nextRequestId++}`;
    const promise = new Promise<BrokerResult<unknown>>((resolve, reject) => {
      const job: PendingJob = { operation, resolve, reject, signal };
      if (signal) {
        job.onAbort = () => sendCancel(requestId);
        signal.addEventListener('abort', job.onAbort, { once: true });
      }
      pending.set(requestId, job);
    });
    emitOperation({ requestId, operation, status: 'running' });
    worker.postMessage({ version: 1, type: 'execute', requestId, operation, payload });
    if (signal?.aborted) sendCancel(requestId);
    return promise as Promise<BrokerResult<T>>;
  };

  return {
    configure(config) {
      const refused = refuseIfFatal();
      if (refused) return Promise.reject(refused);
      const requestId = `model-${nextRequestId++}`;
      const promise = new Promise<BrokerResult<unknown>>((resolve, reject) => pending.set(requestId, { operation: 'configure', resolve, reject }));
      emitOperation({ requestId, operation: 'configure', status: 'running' });
      worker.postMessage({ version: 1, type: 'configure', requestId, config });
      return promise as Promise<BrokerResult<void>>;
    },
    inspectCache: () => run<boolean>('inspect-cache', undefined),
    install: (signal) => run<void>('install', undefined, signal),
    load: (signal) => run<void>('load', undefined, signal),
    generateCandidates: (request, signal) => run<readonly CandidateSuggestion[]>('generate-candidates', request, signal),
    resolveSpokenAnswer: (request, signal) => run<readonly SpokenAnswerCandidate[]>('resolve-spoken-answer', request, signal),
    composeClues: (request, signal) => run<readonly ClueDraft[]>('compose-clues', request, signal),
    unload: (signal) => run<void>('unload', undefined, signal),
    deleteCache: (signal) => run<void>('delete-cache', undefined, signal),
    state: () => currentState,
    subscribeProgress(listener) {
      progressListeners.add(listener);
      return () => progressListeners.delete(listener);
    },
    subscribeState(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    subscribeOperations(listener) {
      operationListeners.add(listener);
      return () => operationListeners.delete(listener);
    },
    cancel: (requestId, cancelOptions) => sendCancel(requestId, cancelOptions?.graceMs),
    isFatal: () => fatal,
    dispose() {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      rejectAll(new ModelClientError('disposed', 'Model worker client disposed'), { status: 'failed', errorCode: 'disposed' });
      operationListeners.clear();
      progressListeners.clear();
      stateListeners.clear();
      worker.terminate();
    }
  };
}

export function createBrowserModelWorkerClient(options?: ModelWorkerClientOptions): ModelWorkerClient {
  const worker = new Worker(new URL('./modelWorker.ts', import.meta.url), { type: 'module' });
  return createModelWorkerClient(worker, options);
}

export type { ModelManifest, RuntimeProbe };
