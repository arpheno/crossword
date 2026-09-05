import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoProcessor, env, pipeline } from '@huggingface/transformers';
import { speechModel } from '../speechConfig';

type WorkerMessage = Readonly<Record<string, unknown>>;
type WorkerScope = {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
};

type MockTranscriber = ReturnType<typeof vi.fn> & {
  processor?: unknown;
  dispose: ReturnType<typeof vi.fn>;
};

vi.mock('@huggingface/transformers', () => ({
  AutoProcessor: { from_pretrained: vi.fn() },
  env: {
    allowRemoteModels: true,
    allowLocalModels: false,
    useBrowserCache: true,
    useFS: false,
    useFSCache: false,
    logLevel: 0
  },
  pipeline: vi.fn()
}));

const mockedPipeline = vi.mocked(pipeline);
const mockedProcessor = vi.mocked(AutoProcessor.from_pretrained);

let workerScope: WorkerScope;
let transcriber: MockTranscriber;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  workerScope = { onmessage: null, postMessage: vi.fn() };
  vi.stubGlobal('self', workerScope);
  transcriber = Object.assign(vi.fn(async () => ({ text: 'you' })), { dispose: vi.fn() });
  mockedPipeline.mockResolvedValue(transcriber as never);
  mockedProcessor.mockResolvedValue({} as never);
  await import('./speechWorker');
});

describe('speech worker runtime configuration', () => {
  it('uses the pinned cache path and safe ONNX graph options for local preparation', async () => {
    workerScope.onmessage?.({
      data: {
        version: 1,
        type: 'execute',
        requestId: 'prepare-1',
        operation: 'prepare',
        payload: { device: 'wasm', localFilesOnly: true }
      }
    } as MessageEvent<unknown>);

    await vi.waitFor(() => expect(mockedPipeline).toHaveBeenCalledOnce());
    const modelUrl = `${speechModel.source}/resolve/${speechModel.revision}`;
    expect(mockedPipeline).toHaveBeenCalledWith(
      'automatic-speech-recognition',
      modelUrl,
      expect.objectContaining({
        revision: speechModel.revision,
        device: 'wasm',
        dtype: 'q8',
        local_files_only: true,
        session_options: { graphOptimizationLevel: 'basic' },
        progress_callback: expect.any(Function)
      })
    );
    expect(mockedProcessor).toHaveBeenCalledWith(modelUrl, {
      revision: speechModel.revision,
      local_files_only: true
    });
    expect(env.allowRemoteModels).toBe(false);
    expect(env.allowLocalModels).toBe(true);
  });

  it('transcribes without unsupported language or task overrides', async () => {
    workerScope.onmessage?.({
      data: {
        version: 1,
        type: 'execute',
        requestId: 'prepare-1',
        operation: 'prepare',
        payload: { device: 'wasm', localFilesOnly: true }
      }
    } as MessageEvent<unknown>);
    await vi.waitFor(() => expect(mockedPipeline).toHaveBeenCalledOnce());
    workerScope.postMessage.mockClear();

    workerScope.onmessage?.({
      data: {
        version: 1,
        type: 'execute',
        requestId: 'transcribe-1',
        operation: 'transcribe',
        payload: { samples: new Float32Array([0.1, -0.1]) }
      }
    } as MessageEvent<unknown>);

    await vi.waitFor(() => expect(workerScope.postMessage.mock.calls.some(([message]) => (message as WorkerMessage).type === 'result')).toBe(true));
    expect(transcriber).toHaveBeenCalledWith(new Float32Array([0.1, -0.1]), {
      sampling_rate: 16_000,
      return_timestamps: false,
      chunk_length_s: 30,
      stride_length_s: 5
    });
    const messages = workerScope.postMessage.mock.calls.map(([message]) => message as WorkerMessage);
    expect(messages).toContainEqual(expect.objectContaining({
      type: 'result',
      requestId: 'transcribe-1',
      operation: 'transcribe',
      result: { ok: true, value: { text: 'you' } }
    }));
  });
});
