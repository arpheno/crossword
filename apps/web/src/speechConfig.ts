export type SpeechDevice = 'webgpu' | 'wasm';

export type SpeechModelArtifact = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
  devices: readonly SpeechDevice[];
}>;

export type SpeechRuntimeArtifact = Readonly<{
  path: string;
  url: string;
  bytes: number;
  sha256: string;
  browser: 'default' | 'safari';
  devices: readonly SpeechDevice[];
}>;

export type SpeechModelManifest = Readonly<{
  schemaVersion: 1;
  id: string;
  revision: string;
  runtimeVersion: string;
  source: string;
  license: string;
  artifacts: readonly SpeechModelArtifact[];
  runtimeArtifacts: readonly SpeechRuntimeArtifact[];
}>;

export type SpeechCapability = Readonly<{
  supported: boolean;
  reason?: string;
  device: SpeechDevice;
}>;

const speechArtifacts: readonly SpeechModelArtifact[] = [
  { path: 'config.json', bytes: 2_197, sha256: '251ea843b5901a99efa58c0b99b8052c6019aa3e7d2baf46693a1128ff606233', devices: ['webgpu', 'wasm'] },
  { path: 'generation_config.json', bytes: 1_646, sha256: '7b2e8451ed5f118e75fdd991409d72119d21d2fef1eba9723f68fb9c57fe5dc9', devices: ['webgpu', 'wasm'] },
  { path: 'preprocessor_config.json', bytes: 339, sha256: 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d', devices: ['webgpu', 'wasm'] },
  { path: 'tokenizer.json', bytes: 2_405_679, sha256: '5eb60cec1e77aeeb6869a2bb5a8e01a84c3fe5d072d75369343021fe6f5310d0', devices: ['webgpu', 'wasm'] },
  { path: 'tokenizer_config.json', bytes: 282_662, sha256: '93879c3dccdd4b976f709acd85b44778873f30c275e67026f30ca1e4c975230c', devices: ['webgpu', 'wasm'] },
  { path: 'onnx/decoder_model_merged_q4.onnx', bytes: 86_712_166, sha256: '57d4303f3bbc8bb4016273b172285236f5719c75e8a7d23b7265cfa1d71494a4', devices: ['webgpu'] },
  { path: 'onnx/encoder_model_q4.onnx', bytes: 9_020_667, sha256: 'bb73f790e63906c9e9d02c4e3abf55817dd16fd7ef7c7f4754c1395202191b29', devices: ['webgpu'] },
  { path: 'onnx/decoder_model_merged_quantized.onnx', bytes: 30_718_858, sha256: 'c0592d0749413c960569e1c7fb806b060d5d18f3ebad4a95cbf9a77dc6e9be52', devices: ['wasm'] },
  { path: 'onnx/encoder_model_quantized.onnx', bytes: 10_124_993, sha256: 'e93ec822f16a8fd264e7de972ad17d615ea7334b75a52d54c50c2e18dd503a25', devices: ['wasm'] }
];

const speechRuntimeArtifacts: readonly SpeechRuntimeArtifact[] = [
  { path: 'dist/ort-wasm-simd-threaded.asyncify.mjs', url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort-wasm-simd-threaded.asyncify.mjs', bytes: 47_507, sha256: '7236653b8565da4046e459cd0e274123419a1d9f1f8f18fd36c28058346ca655', browser: 'default', devices: ['wasm'] },
  { path: 'dist/ort-wasm-simd-threaded.asyncify.wasm', url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort-wasm-simd-threaded.asyncify.wasm', bytes: 24_254_953, sha256: '7e83cd6cee77e478bc96a7e91b198144fb5e4126287daf1f9b54bb195ebcd55a', browser: 'default', devices: ['wasm'] },
  { path: 'dist/ort-wasm-simd-threaded.mjs', url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort-wasm-simd-threaded.mjs', bytes: 24_180, sha256: '0a1e718d99c41b22c21f2520ff4f9e883a6b5533856e398d21816ee8eb8185d3', browser: 'safari', devices: ['wasm'] },
  { path: 'dist/ort-wasm-simd-threaded.wasm', url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort-wasm-simd-threaded.wasm', bytes: 13_479_978, sha256: 'd1ab1b94b16a65b29d710d0b587b29e7bed336827577623913479b8afe8113e6', browser: 'safari', devices: ['wasm'] }
];

function isSafariBrowser(): boolean {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /Safari\//.test(userAgent) && !/(Chrome|Chromium|Firefox|Android)/.test(userAgent);
}

export function speechRuntimeArtifactsFor(device: SpeechDevice): readonly SpeechRuntimeArtifact[] {
  const browser = isSafariBrowser() ? 'safari' : 'default';
  return speechRuntimeArtifacts.filter((artifact) => artifact.devices.includes(device) && artifact.browser === browser);
}

const speechBytesFor = (device: SpeechDevice): number => speechArtifacts
  .filter((artifact) => artifact.devices.includes(device))
  .reduce((total, artifact) => total + artifact.bytes, 0);

export const speechModelManifest: SpeechModelManifest = {
  schemaVersion: 1,
  id: 'onnx-community/whisper-tiny.en',
  revision: '2575352d61be1bf7225cf8f8b268a4678025fc58',
  runtimeVersion: '@huggingface/transformers@4.2.0; onnxruntime-web@1.27.0',
  source: 'https://huggingface.co/onnx-community/whisper-tiny.en',
  license: 'MIT base model; ONNX conversion provenance reviewed from the pinned model card',
  artifacts: speechArtifacts,
  runtimeArtifacts: speechRuntimeArtifacts
} as const;

const runtimeBytesFor = (device: SpeechDevice): number => speechRuntimeArtifactsFor(device)
  .reduce((total, artifact) => total + artifact.bytes, 0);

export const speechModel = {
  ...speechModelManifest,
  estimatedBytesByDevice: {
    webgpu: speechBytesFor('webgpu') + runtimeBytesFor('webgpu'),
    wasm: speechBytesFor('wasm') + runtimeBytesFor('wasm')
  },
  estimatedBytes: speechBytesFor('webgpu') + runtimeBytesFor('webgpu')
} as const;

export function browserSpeechCapability(): SpeechCapability {
  const browserWindow = typeof window === 'undefined' ? undefined : window;
  const browserNavigator = typeof navigator === 'undefined' ? undefined : navigator;
  const hostname = typeof location === 'undefined' ? '' : location.hostname;
  const secureContext = browserWindow?.isSecureContext === true
    || hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1';
  const device: SpeechDevice = browserNavigator && 'gpu' in browserNavigator ? 'webgpu' : 'wasm';

  if (!secureContext) return { supported: false, device, reason: 'Voice input requires a secure browser context.' };
  if (!browserNavigator?.mediaDevices?.getUserMedia) return { supported: false, device, reason: 'This browser does not provide microphone capture.' };
  if (typeof MediaRecorder === 'undefined') return { supported: false, device, reason: 'This browser does not provide audio recording.' };
  if (typeof Worker === 'undefined') return { supported: false, device, reason: 'This browser does not provide module workers.' };
  if (typeof AudioContext === 'undefined' && typeof (browserWindow as Window & { webkitAudioContext?: typeof AudioContext } | undefined)?.webkitAudioContext === 'undefined') {
    return { supported: false, device, reason: 'This browser cannot decode microphone audio locally.' };
  }
  return { supported: true, device };
}