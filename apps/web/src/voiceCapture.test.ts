// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMicrophoneCapture } from './voiceCapture';

const decodedAudio = {
  length: 2,
  numberOfChannels: 1,
  sampleRate: 16_000,
  getChannelData: () => new Float32Array([0.1, -0.1])
} as unknown as AudioBuffer;

let track: { stop: ReturnType<typeof vi.fn> };
let getUserMedia: ReturnType<typeof vi.fn>;
let decodeAudioData: ReturnType<typeof vi.fn>;
let resolveDecode: ((audio: AudioBuffer) => void) | undefined;
let activeRecorder: FakeMediaRecorder | undefined;

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  static emitStop = true;
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  constructor() {
    activeRecorder = this;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (FakeMediaRecorder.emitStop) this.onstop?.();
  }
}

class FakeAudioContext {
  decodeAudioData = decodeAudioData;
  close = vi.fn(async () => undefined);
}

describe('microphone capture lifecycle', () => {
  beforeEach(() => {
    track = { stop: vi.fn() };
    getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }));
    decodeAudioData = vi.fn(() => new Promise<AudioBuffer>((resolve) => {
      resolveDecode = resolve;
    }));
    resolveDecode = undefined;
    activeRecorder = undefined;
    FakeMediaRecorder.emitStop = true;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia }
    });
    Object.defineProperty(Blob.prototype, 'arrayBuffer', {
      configurable: true,
      value: vi.fn(async () => new ArrayBuffer(0))
    });
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  it('stops media tracks before waiting for audio decode', async () => {
    const capture = await createMicrophoneCapture();
    const stopped = capture.stop();

    expect(track.stop).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(1));

    resolveDecode?.(decodedAudio);
    await expect(stopped).resolves.toEqual(new Float32Array([0.1, -0.1]));
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('cancels idempotently while decoding and leaves no live track', async () => {
    const capture = await createMicrophoneCapture();
    const stopped = capture.stop();
    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(1));

    capture.cancel();
    capture.cancel();
    expect(track.stop).toHaveBeenCalledTimes(1);

    resolveDecode?.(decodedAudio);
    await expect(stopped).resolves.toEqual(new Float32Array());
  });

  it('cancels before stop without requiring recorder completion', async () => {
    const capture = await createMicrophoneCapture();
    capture.cancel();

    expect(track.stop).toHaveBeenCalledTimes(1);
    await expect(capture.stop()).resolves.toEqual(new Float32Array());
    expect(decodeAudioData).not.toHaveBeenCalled();
  });

  it('settles with an error and stops tracks when the recorder fails', async () => {
    const capture = await createMicrophoneCapture();
    activeRecorder?.onerror?.();

    await expect(capture.stop()).rejects.toThrow('recording failed');
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('times out when the recorder never emits stop', async () => {
    vi.useFakeTimers();
    try {
      FakeMediaRecorder.emitStop = false;
      const capture = await createMicrophoneCapture();
      const stopped = capture.stop();
      const rejection = expect(stopped).rejects.toThrow('did not stop');

      await vi.advanceTimersByTimeAsync(2_000);

      await rejection;
      expect(track.stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
