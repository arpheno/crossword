export type MicrophoneCapture = Readonly<{
  stop: () => Promise<Float32Array>;
  cancel: () => void;
}>;

const TARGET_SAMPLE_RATE = 16_000;
const RECORDING_STOP_TIMEOUT_MS = 2_000;

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

function audioContextConstructor(): typeof AudioContext | undefined {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  const browserWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  return browserWindow.webkitAudioContext;
}

function resample(buffer: AudioBuffer): Float32Array {
  if (!Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0 || buffer.length === 0) {
    throw new Error('The microphone recording did not contain audio samples.');
  }
  const mono = new Float32Array(buffer.length);
  for (let frame = 0; frame < buffer.length; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const sample = buffer.getChannelData(channel)[frame] ?? 0;
      sum += Number.isFinite(sample) ? sample : 0;
    }
    mono[frame] = sum / Math.max(1, buffer.numberOfChannels);
  }
  if (buffer.sampleRate === TARGET_SAMPLE_RATE) return mono;
  const length = Math.max(1, Math.round(mono.length * TARGET_SAMPLE_RATE / buffer.sampleRate));
  const output = new Float32Array(length);
  for (let index = 0; index < output.length; index += 1) {
    const sourcePosition = index * (mono.length - 1) / Math.max(1, output.length - 1);
    const left = Math.floor(sourcePosition);
    const right = Math.min(mono.length - 1, left + 1);
    const fraction = sourcePosition - left;
    output[index] = (mono[left] ?? 0) * (1 - fraction) + (mono[right] ?? 0) * fraction;
  }
  return output;
}

async function decodeRecording(blob: Blob): Promise<Float32Array> {
  const AudioContextConstructor = audioContextConstructor();
  if (!AudioContextConstructor) throw new Error('This browser cannot decode microphone audio locally.');
  const context = new AudioContextConstructor();
  try {
    return resample(await context.decodeAudioData(await blob.arrayBuffer()));
  } finally {
    await context.close();
  }
}

export async function createMicrophoneCapture(): Promise<MicrophoneCapture> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone capture is unavailable in this browser.');
  if (typeof MediaRecorder === 'undefined') throw new Error('Audio recording is unavailable in this browser.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  });
  const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  let recorder: MediaRecorder;
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch (error) {
    stopTracks(stream);
    throw error instanceof Error ? error : new Error('Audio recording could not start.');
  }

  const chunks: Blob[] = [];
  let cancelled = false;
  let stopped = false;
  let tracksStopped = false;
  let recordingSettled = false;
  let stopTimer: number | null = null;
  let resolveRecording: (blob: Blob) => void = () => undefined;
  let rejectRecording: (error: Error) => void = () => undefined;
  const recording = new Promise<Blob>((resolve, reject) => {
    resolveRecording = resolve;
    rejectRecording = reject;
  });
  void recording.catch(() => undefined);
  const stopTracksImmediately = () => {
    if (tracksStopped) return;
    tracksStopped = true;
    stopTracks(stream);
  };
  const resolveRecordingOnce = (blob: Blob) => {
    if (recordingSettled) return;
    recordingSettled = true;
    if (stopTimer !== null) window.clearTimeout(stopTimer);
    stopTimer = null;
    resolveRecording(blob);
  };
  const rejectRecordingOnce = (error: Error) => {
    if (recordingSettled) return;
    recordingSettled = true;
    if (stopTimer !== null) window.clearTimeout(stopTimer);
    stopTimer = null;
    rejectRecording(error);
  };
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.onerror = () => {
    stopTracksImmediately();
    rejectRecordingOnce(new Error('The microphone recording failed.'));
  };
  recorder.onstop = () => resolveRecordingOnce(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
  try {
    recorder.start(250);
  } catch (error) {
    stopTracksImmediately();
    throw error instanceof Error ? error : new Error('Audio recording could not start.');
  }

  const stop = async (): Promise<Float32Array> => {
    if (!stopped) {
      stopped = true;
      stopTracksImmediately();
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch (error) {
          rejectRecordingOnce(error instanceof Error ? error : new Error('The microphone recording could not stop.'));
        }
      }
      if (!recordingSettled) {
        stopTimer = window.setTimeout(() => {
          rejectRecordingOnce(new Error('The microphone recording did not stop.'));
        }, RECORDING_STOP_TIMEOUT_MS);
      }
    }
    try {
      if (cancelled) return new Float32Array();
      const blob = await recording;
      if (cancelled) return new Float32Array();
      const samples = await decodeRecording(blob);
      return cancelled ? new Float32Array() : samples;
    } finally {
      stopTracksImmediately();
    }
  };

  return {
    stop,
    cancel() {
      cancelled = true;
      stopped = true;
      stopTracksImmediately();
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // The track is already stopped; cancellation remains terminal.
        }
      }
      resolveRecordingOnce(new Blob());
    }
  };
}