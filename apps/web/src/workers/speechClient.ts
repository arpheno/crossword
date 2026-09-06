import { speechModel, type SpeechDevice } from '../speechConfig';

export type SpeechState = 'uninstalled' | 'loading' | 'ready' | 'transcribing' | 'unloading';
export type SpeechFailureCode = 'unsupported-device' | 'model-load-failed' | 'invalid-audio' | 'busy' | 'cancelled';
export type SpeechTranscript = Readonly<{ text: string; confidence?: number }>;
export type SpeechProgress = Readonly<{
  loaded: number;
  total: number;
  progress: number;
  file?: string;
}>;
export type SpeechResult<T> = Readonly<
  | { ok: true; value: T }
  | { ok: false; error: Readonly<{ code: SpeechFailureCode; message: string }> }
>;

export type SpeechWorkerOperation = 'prepare' | 'transcribe' | 'unload';
export type SpeechWorkerRequest = Readonly<
  | { version: 1; type: 'execute'; requestId: string; operation: 'prepare'; payload: Readonly<{ device: SpeechDevice; localFilesOnly?: boolean }> }
  | { version: 1; type: 'execute'; requestId: string; operation: 'transcribe'; payload: Readonly<{ samples: Float32Array }> }
  | { version: 1; type: 'execute'; requestId: string; operation: 'unload' }
  | { version: 1; type: 'cancel'; requestId: string }
>;

export type SpeechWorkerResponse = Readonly<
  | { version: 1; type: 'state'; state: SpeechState }
  | { version: 1; type: 'progress'; requestId: string; progress: SpeechProgress }
  | { version: 1; type: 'result'; requestId: string; operation: SpeechWorkerOperation; result: SpeechResult<unknown> }
  | { version: 1; type: 'protocol-error'; requestId?: string; message: string }
>;

const speechStates: readonly SpeechState[] = ['uninstalled', 'loading', 'ready', 'transcribing', 'unloading'];
const operations: readonly SpeechWorkerOperation[] = ['prepare', 'transcribe', 'unload'];
const failureCodes: readonly SpeechFailureCode[] = ['unsupported-device', 'model-load-failed', 'invalid-audio', 'busy', 'cancelled'];
const MAX_AUDIO_SAMPLES = 16_000 * 60;
const MAX_TRANSCRIPT_LENGTH = 500;
const MAX_ERROR_LENGTH = 500;

type SpeechWorkerPayload = Readonly<{ device: SpeechDevice; localFilesOnly?: boolean } | { samples: Float32Array }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSpeechDevice(value: unknown): value is SpeechDevice {
  return value === 'webgpu' || value === 'wasm';
}

export function parseSpeechWorkerRequest(value: unknown): SpeechWorkerRequest | undefined {
  if (!isRecord(value) || value.version !== 1 || typeof value.type !== 'string') return undefined;
  if (value.type === 'cancel' && typeof value.requestId === 'string' && value.requestId) {
    return { version: 1, type: 'cancel', requestId: value.requestId };
  }
  if (value.type !== 'execute' || typeof value.requestId !== 'string' || !value.requestId || !operations.includes(value.operation as SpeechWorkerOperation)) return undefined;
  const operation = value.operation as SpeechWorkerOperation;
  if (operation === 'prepare' && isRecord(value.payload) && isSpeechDevice(value.payload.device) && (value.payload.localFilesOnly === undefined || typeof value.payload.localFilesOnly === 'boolean')) {
    return {
      version: 1,
      type: 'execute',
      requestId: value.requestId,
      operation,
      payload: {
        device: value.payload.device,
        ...(value.payload.localFilesOnly === undefined ? {} : { localFilesOnly: value.payload.localFilesOnly })
      }
    };
  }
  if (operation === 'transcribe' && isRecord(value.payload) && value.payload.samples instanceof Float32Array && value.payload.samples.length > 0 && value.payload.samples.length <= MAX_AUDIO_SAMPLES && value.payload.samples.every(Number.isFinite)) {
    return { version: 1, type: 'execute', requestId: value.requestId, operation, payload: { samples: value.payload.samples } };
  }
  if (operation === 'unload' && value.payload === undefined) {
    return { version: 1, type: 'execute', requestId: value.requestId, operation };
  }
  return undefined;
}

function isSpeechFailure(value: unknown): boolean {
  return isRecord(value)
    && failureCodes.includes(value.code as SpeechFailureCode)
    && typeof value.message === 'string'
    && value.message.length <= MAX_ERROR_LENGTH;
}

function isSpeechResult(value: unknown, operation: SpeechWorkerOperation): value is SpeechResult<unknown> {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false;
  if (!value.ok) return isSpeechFailure(value.error);
  if (operation === 'prepare' || operation === 'unload') return value.value === undefined;
  if (!isRecord(value.value) || typeof value.value.text !== 'string' || value.value.text.length === 0 || value.value.text.length > MAX_TRANSCRIPT_LENGTH) return false;
  return value.value.confidence === undefined
    || (typeof value.value.confidence === 'number' && Number.isFinite(value.value.confidence) && value.value.confidence >= 0 && value.value.confidence <= 1);
}

function isSpeechProgress(value: unknown): value is SpeechProgress {
  return isRecord(value)
    && typeof value.loaded === 'number'
    && Number.isFinite(value.loaded)
    && value.loaded >= 0
    && typeof value.total === 'number'
    && Number.isFinite(value.total)
    && value.total > 0
    && typeof value.progress === 'number'
    && Number.isFinite(value.progress)
    && value.progress >= 0
    && value.progress <= 1
    && (value.file === undefined || (typeof value.file === 'string' && value.file.length <= 500));
}

export function parseSpeechWorkerResponse(value: unknown): SpeechWorkerResponse | undefined {
  if (!isRecord(value) || value.version !== 1 || typeof value.type !== 'string') return undefined;
  if (value.type === 'state' && speechStates.includes(value.state as SpeechState)) {
    return { version: 1, type: 'state', state: value.state as SpeechState };
  }
  if (value.type === 'progress' && typeof value.requestId === 'string' && value.requestId && isSpeechProgress(value.progress)) {
    return { version: 1, type: 'progress', requestId: value.requestId, progress: value.progress };
  }
  if (value.type === 'protocol-error' && typeof value.message === 'string' && (value.requestId === undefined || typeof value.requestId === 'string')) {
    return { version: 1, type: 'protocol-error', requestId: value.requestId, message: value.message };
  }
  if (value.type !== 'result' || typeof value.requestId !== 'string' || !value.requestId || !operations.includes(value.operation as SpeechWorkerOperation) || !isSpeechResult(value.result, value.operation as SpeechWorkerOperation)) return undefined;
  return {
    version: 1,
    type: 'result',
    requestId: value.requestId,
    operation: value.operation as SpeechWorkerOperation,
    result: value.result
  };
}

type PendingJob = {
  operation: SpeechWorkerOperation;
  resolve: (result: SpeechResult<unknown>) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  onProgress?: (progress: SpeechProgress) => void;
};

const cancelledResult: SpeechResult<void> = {
  ok: false,
  error: { code: 'cancelled', message: 'Speech work cancelled' }
};

export interface SpeechWorkerClient {
  prepare(device: SpeechDevice, signal?: AbortSignal, onProgress?: (progress: SpeechProgress) => void, localFilesOnly?: boolean): Promise<SpeechResult<void>>;
  transcribe(samples: Float32Array, signal?: AbortSignal): Promise<SpeechResult<SpeechTranscript>>;
  unload(signal?: AbortSignal): Promise<SpeechResult<void>>;
  state(): SpeechState;
  subscribe?: (listener: (state: SpeechState) => void) => () => void;
  dispose(): void;
}

export type SpeechWorkerFactory = () => Worker;

function responseRequestId(value: unknown): string | undefined {
  return typeof value === 'object' && value !== null && 'requestId' in value && typeof value.requestId === 'string' ? value.requestId : undefined;
}

export function createSpeechWorkerClient(worker: Worker, createWorker?: SpeechWorkerFactory): SpeechWorkerClient {
  const pending = new Map<string, PendingJob>();
  let nextRequestId = 1;
  let currentState: SpeechState = 'uninstalled';
  let activeWorker = worker;
  let disposed = false;
  const stateListeners = new Set<(state: SpeechState) => void>();

  const setState = (state: SpeechState) => {
    currentState = state;
    for (const listener of stateListeners) listener(state);
  };

  const settle = (requestId: string, action: (job: PendingJob) => void) => {
    const job = pending.get(requestId);
    if (!job) return;
    pending.delete(requestId);
    if (job.signal && job.onAbort) job.signal.removeEventListener('abort', job.onAbort);
    action(job);
  };

  const rejectAll = (error: Error) => {
    for (const requestId of pending.keys()) settle(requestId, (job) => job.reject(error));
  };

  const removeWorkerListeners = (target: Worker) => {
    target.removeEventListener('message', handleMessage);
    target.removeEventListener('error', handleError);
  };

  const addWorkerListeners = (target: Worker) => {
    target.addEventListener('message', handleMessage);
    target.addEventListener('error', handleError);
  };

  const replaceWorker = (error = new Error('Speech worker restarted')) => {
    if (disposed) return;
    const previous = activeWorker;
    removeWorkerListeners(previous);
    previous.terminate();
    setState('uninstalled');
    rejectAll(error);
    if (createWorker) {
      activeWorker = createWorker();
      addWorkerListeners(activeWorker);
    }
  };

  const handleMessage = (event: MessageEvent<unknown>) => {
    const message = parseSpeechWorkerResponse(event.data);
    if (!message) {
      const requestId = responseRequestId(event.data);
      if (requestId) settle(requestId, (job) => job.reject(new Error('Invalid speech worker response')));
      else rejectAll(new Error('Invalid speech worker response'));
      return;
    }
    if (message.type === 'state') {
      setState(message.state);
      return;
    }
    if (message.type === 'progress') {
      pending.get(message.requestId)?.onProgress?.(message.progress);
      return;
    }
    if (message.type === 'result') {
      const job = pending.get(message.requestId);
      if (job && job.operation !== message.operation) {
        settle(message.requestId, (pendingJob) => pendingJob.reject(new Error('Speech worker response operation mismatch')));
        return;
      }
      settle(message.requestId, (pendingJob) => pendingJob.resolve(message.result));
      return;
    }
    if (message.requestId) settle(message.requestId, (job) => job.reject(new Error(message.message)));
    else rejectAll(new Error(message.message));
  };

  const handleError = () => replaceWorker(new Error('Speech worker stopped unexpectedly'));
  addWorkerListeners(activeWorker);

  const cancelRequest = (requestId: string) => {
    const job = pending.get(requestId);
    if (!job) return;
    try {
      activeWorker.postMessage({ version: 1, type: 'cancel', requestId } satisfies SpeechWorkerRequest);
    } catch {
      // Worker termination below remains the cancellation guarantee.
    }
    settle(requestId, (pendingJob) => pendingJob.resolve(cancelledResult));
    replaceWorker();
  };

  const run = <T>(operation: SpeechWorkerOperation, payload: SpeechWorkerPayload | undefined, signal?: AbortSignal, onProgress?: (progress: SpeechProgress) => void): Promise<SpeechResult<T>> => {
    const requestId = `speech-${nextRequestId++}`;
    const promise = new Promise<SpeechResult<unknown>>((resolve, reject) => {
      const job: PendingJob = { operation, resolve, reject, signal, onProgress };
      if (signal) {
        job.onAbort = () => cancelRequest(requestId);
        signal.addEventListener('abort', job.onAbort, { once: true });
      }
      pending.set(requestId, job);
    });
    const request = { version: 1, type: 'execute', requestId, operation, ...(payload === undefined ? {} : { payload }) } as SpeechWorkerRequest;
    if (operation === 'transcribe' && payload && typeof payload === 'object' && 'samples' in payload && payload.samples instanceof Float32Array) {
      activeWorker.postMessage(request, [payload.samples.buffer as ArrayBuffer]);
    } else {
      activeWorker.postMessage(request);
    }
    if (signal?.aborted) cancelRequest(requestId);
    return promise as Promise<SpeechResult<T>>;
  };

  return {
    prepare: (device, signal, onProgress, localFilesOnly = false) => run<void>('prepare', { device, localFilesOnly }, signal, onProgress),
    transcribe: (samples, signal) => run<SpeechTranscript>('transcribe', { samples }, signal),
    unload: (signal) => run<void>('unload', undefined, signal),
    state: () => currentState,
    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    dispose() {
      removeWorkerListeners(activeWorker);
      disposed = true;
      rejectAll(new Error('Speech worker client disposed'));
      stateListeners.clear();
      activeWorker.terminate();
    }
  };
}

export function createBrowserSpeechWorkerClient(): SpeechWorkerClient {
  const createWorker = () => new Worker(new URL('./speechWorker.ts', import.meta.url), { type: 'module' });
  return createSpeechWorkerClient(createWorker(), createWorker);
}

export { speechModel };