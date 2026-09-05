import { AutoProcessor, env, pipeline, type DeviceType } from '@huggingface/transformers';
import { speechModel, type SpeechDevice } from '../speechConfig';
import {
  type SpeechResult,
  type SpeechProgress,
  type SpeechState,
  type SpeechTranscript,
  type SpeechWorkerOperation,
  type SpeechWorkerRequest,
  type SpeechWorkerResponse,
  parseSpeechWorkerRequest
} from './speechClient';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<SpeechWorkerRequest>) => void) | null;
  postMessage: (message: SpeechWorkerResponse) => void;
};

type Transcriber = Awaited<ReturnType<typeof pipeline<'automatic-speech-recognition'>>>;
let transcriber: Transcriber | undefined;
let loadedDevice: SpeechDevice | undefined;
let currentState: SpeechState = 'uninstalled';
const jobs = new Map<string, AbortController>();
type WebGpuNavigator = Navigator & Readonly<{ gpu?: Readonly<{ requestAdapter: () => Promise<unknown> }> }>;
const speechSessionOptions = { graphOptimizationLevel: 'basic' } as const;
const pinnedSpeechModelUrl = `${speechModel.source}/resolve/${speechModel.revision}`;

const postState = (state: SpeechState) => {
  currentState = state;
  workerScope.postMessage({ version: 1, type: 'state', state });
};

function success<T>(value: T): SpeechResult<T> {
  return { ok: true, value };
}

function failure<T>(code: 'unsupported-device' | 'model-load-failed' | 'invalid-audio' | 'busy' | 'cancelled', message: string): SpeechResult<T> {
  return { ok: false, error: { code, message } };
}

function isCancelled(signal: AbortSignal): boolean {
  return signal.aborted;
}

async function hasUsableWebGpuAdapter(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const gpu = (navigator as WebGpuNavigator).gpu;
  if (!gpu) return false;
  try {
    return Boolean(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

function progressReporter(requestId: string, device: SpeechDevice): (value: unknown) => void {
  const expected = speechModel.artifacts.filter((artifact) => artifact.devices.includes(device));
  const expectedByPath = new Map(expected.map((artifact) => [artifact.path, artifact] as const));
  const loadedByPath = new Map<string, number>();
  const total = expected.reduce((sum, artifact) => sum + artifact.bytes, 0);
  return (value: unknown) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
    const info = value as Record<string, unknown>;
    const status = typeof info.status === 'string' ? info.status : '';
    const file = typeof info.file === 'string' ? info.file : undefined;
    if (status === 'progress_total' && typeof info.files === 'object' && info.files !== null && !Array.isArray(info.files)) {
      for (const [path, fileInfo] of Object.entries(info.files as Record<string, unknown>)) {
        const artifact = expectedByPath.get(path);
        if (!artifact || typeof fileInfo !== 'object' || fileInfo === null || Array.isArray(fileInfo)) continue;
        const loaded = (fileInfo as Record<string, unknown>).loaded;
        if (typeof loaded === 'number' && Number.isFinite(loaded)) loadedByPath.set(path, Math.min(artifact.bytes, Math.max(0, loaded)));
      }
    } else if (file) {
      const artifact = expectedByPath.get(file);
      if (!artifact) return;
      if (status === 'done') loadedByPath.set(file, artifact.bytes);
      else if (typeof info.loaded === 'number' && Number.isFinite(info.loaded)) loadedByPath.set(file, Math.min(artifact.bytes, Math.max(0, info.loaded)));
      else if (!loadedByPath.has(file)) loadedByPath.set(file, 0);
    } else {
      return;
    }
    const loaded = [...loadedByPath.values()].reduce((sum, bytes) => sum + bytes, 0);
    const progress: SpeechProgress = {
      loaded,
      total,
      progress: total > 0 ? Math.min(1, loaded / total) : 0,
      ...(file ? { file } : {})
    };
    workerScope.postMessage({ version: 1, type: 'progress', requestId, progress });
  };
}

async function disposeTranscriber(): Promise<void> {
  const current = transcriber;
  transcriber = undefined;
  loadedDevice = undefined;
  if (current) await current.dispose();
}

async function ensureProcessor(candidate: Transcriber, localFilesOnly: boolean): Promise<Transcriber> {
  if (!candidate.processor) {
    candidate.processor = await AutoProcessor.from_pretrained(localFilesOnly ? pinnedSpeechModelUrl : speechModel.id, {
      revision: speechModel.revision,
      local_files_only: localFilesOnly
    });
  }
  return candidate;
}

async function ensureTranscriber(device: SpeechDevice, signal: AbortSignal, requestId: string, localFilesOnly: boolean): Promise<SpeechResult<void>> {
  if (isCancelled(signal)) return failure('cancelled', 'Speech model preparation cancelled');
  if (transcriber && loadedDevice === device) return success(undefined);
  if (device === 'webgpu' && !(await hasUsableWebGpuAdapter())) {
    return failure('unsupported-device', 'WebGPU is not available on this device');
  }
  postState('loading');
  try {
    await disposeTranscriber();
    env.allowRemoteModels = !localFilesOnly;
    env.allowLocalModels = true;
    env.useBrowserCache = true;
    env.useFS = false;
    env.useFSCache = false;
    env.logLevel = 50;
    const onProgress = progressReporter(requestId, device);
    const modelPath = localFilesOnly ? pinnedSpeechModelUrl : speechModel.id;
    transcriber = await ensureProcessor(await pipeline('automatic-speech-recognition', modelPath, {
      revision: speechModel.revision,
      device: device as DeviceType,
      dtype: device === 'webgpu' ? 'q4' : 'q8',
      progress_callback: onProgress,
      local_files_only: localFilesOnly,
      session_options: speechSessionOptions
    }), localFilesOnly);
    loadedDevice = device;
    if (isCancelled(signal)) {
      await disposeTranscriber();
      postState('uninstalled');
      return failure('cancelled', 'Speech model preparation cancelled');
    }

    if (!localFilesOnly) {
      // Reload from cache only to prove that Ready does not depend on a live network.
      await disposeTranscriber();
      transcriber = await ensureProcessor(await pipeline('automatic-speech-recognition', pinnedSpeechModelUrl, {
        revision: speechModel.revision,
        device: device as DeviceType,
        dtype: device === 'webgpu' ? 'q4' : 'q8',
        local_files_only: true,
        session_options: speechSessionOptions
      }), true);
      loadedDevice = device;
      if (isCancelled(signal)) {
        await disposeTranscriber();
        postState('uninstalled');
        return failure('cancelled', 'Speech model preparation cancelled');
      }
    }
    postState('ready');
    return success(undefined);
  } catch (error) {
    await disposeTranscriber();
    postState('uninstalled');
    return failure('model-load-failed', error instanceof Error ? error.message : 'Speech model could not be loaded');
  }
}

async function transcribe(samples: Float32Array, signal: AbortSignal): Promise<SpeechResult<SpeechTranscript>> {
  if (!transcriber || currentState === 'uninstalled') return failure('model-load-failed', 'Load the speech model before recording');
  if (samples.length === 0 || samples.length > 16_000 * 60) return failure('invalid-audio', 'The recording did not contain a usable utterance');
  if (isCancelled(signal)) return failure('cancelled', 'Speech transcription cancelled');
  postState('transcribing');
  try {
    const output = await transcriber(samples, {
      sampling_rate: 16_000,
      return_timestamps: false,
      chunk_length_s: 30,
      stride_length_s: 5
    });
    if (isCancelled(signal)) return failure('cancelled', 'Speech transcription cancelled');
    const text = typeof output.text === 'string' ? output.text.trim() : '';
    return text ? success({ text }) : failure('invalid-audio', 'I could not hear a usable utterance');
  } catch (error) {
    if (isCancelled(signal)) return failure('cancelled', 'Speech transcription cancelled');
    return failure('model-load-failed', error instanceof Error ? error.message : 'Speech transcription failed');
  } finally {
    postState('ready');
  }
}

workerScope.onmessage = (event) => {
  const message = parseSpeechWorkerRequest(event.data);
  if (!message) {
    workerScope.postMessage({ version: 1, type: 'protocol-error', message: 'Unsupported speech worker message' });
    return;
  }
  if (message.type === 'cancel') {
    jobs.get(message.requestId)?.abort();
    return;
  }
  if (message.type !== 'execute') {
    workerScope.postMessage({ version: 1, type: 'protocol-error', message: 'Unsupported speech worker message' });
    return;
  }
  if (jobs.size > 0) {
    workerScope.postMessage({ version: 1, type: 'result', requestId: message.requestId, operation: message.operation, result: failure('busy', 'Speech work is already running') });
    return;
  }
  const controller = new AbortController();
  jobs.set(message.requestId, controller);
  const operation: SpeechWorkerOperation = message.operation;
  const result = message.operation === 'prepare'
    ? ensureTranscriber(message.payload.device, controller.signal, message.requestId, message.payload.localFilesOnly ?? false)
    : message.operation === 'transcribe'
      ? transcribe(message.payload.samples, controller.signal)
      : (async () => {
        if (isCancelled(controller.signal)) return failure('cancelled', 'Speech model unload cancelled');
        postState('unloading');
        await disposeTranscriber();
        postState('uninstalled');
        return success(undefined);
      })();
  void result.then((value) => {
    workerScope.postMessage({ version: 1, type: 'result', requestId: message.requestId, operation, result: value });
  }).catch((error: unknown) => {
    workerScope.postMessage({ version: 1, type: 'protocol-error', requestId: message.requestId, message: error instanceof Error ? error.message : 'Speech worker operation failed' });
    if (operation !== 'unload') postState('ready');
  }).finally(() => jobs.delete(message.requestId));
};