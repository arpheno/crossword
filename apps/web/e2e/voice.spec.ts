import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { gridCell, openSolver } from './helpers';

type VoiceTestState = Readonly<{
  prepareLocalFilesOnly: boolean[];
  prepareDevices: string[];
  trackStops: number;
  workerTerminations: number;
}>;

async function installVoiceFakes(page: Page, options: Readonly<{
  denyMicrophone?: boolean;
  failWebGpu?: boolean;
  initialCache?: 'cached' | 'empty';
  storageFreeBytes?: number;
  transcriptionDelayMs?: number;
  voiceTranscript?: string;
}> = {}) {
  await page.addInitScript(({ denyMicrophone, failWebGpu, initialCache, storageFreeBytes, transcriptionDelayMs, voiceTranscript }) => {
    const state = {
      prepareLocalFilesOnly: [] as boolean[],
      prepareDevices: [] as string[],
      trackStops: 0,
      workerTerminations: 0
    };
    (window as Window & { __voiceTestState: typeof state }).__voiceTestState = state;

    const artifacts = [
      ['config.json', '251ea843b5901a99efa58c0b99b8052c6019aa3e7d2baf46693a1128ff606233'],
      ['generation_config.json', '7b2e8451ed5f118e75fdd991409d72119d21d2fef1eba9723f68fb9c57fe5dc9'],
      ['preprocessor_config.json', 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d'],
      ['tokenizer.json', '5eb60cec1e77aeeb6869a2bb5a8e01a84c3fe5d072d75369343021fe6f5310d0'],
      ['tokenizer_config.json', '93879c3dccdd4b976f709acd85b44778873f30c275e67026f30ca1e4c975230c'],
      ['onnx/decoder_model_merged_q4.onnx', '57d4303f3bbc8bb4016273b172285236f5719c75e8a7d23b7265cfa1d71494a4'],
      ['onnx/encoder_model_q4.onnx', 'bb73f790e63906c9e9d02c4e3abf55817dd16fd7ef7c7f4754c1395202191b29'],
      ['onnx/decoder_model_merged_quantized.onnx', 'c0592d0749413c960569e1c7fb806b060d5d18f3ebad4a95cbf9a77dc6e9be52'],
      ['onnx/encoder_model_quantized.onnx', 'e93ec822f16a8fd264e7de972ad17d615ea7334b75a52d54c50c2e18dd503a25']
    ] as const;
    const runtimeArtifacts = [
      ['https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort-wasm-simd-threaded.asyncify.mjs', '7236653b8565da4046e459cd0e274123419a1d9f1f8f18fd36c28058346ca655'],
      ['https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort-wasm-simd-threaded.asyncify.wasm', '7e83cd6cee77e478bc96a7e91b198144fb5e4126287daf1f9b54bb195ebcd55a']
    ] as const;
    const revision = '2575352d61be1bf7225cf8f8b268a4678025fc58';
    const modelPrefix = `/onnx-community/whisper-tiny.en/resolve/${revision}/`;
    const digestByBody = new Map<string, string>();
    const entries = new Map<string, { body: ArrayBuffer; bytes: number }>();

    function hexBuffer(hex: string): ArrayBuffer {
      const bytes = new Uint8Array(hex.length / 2);
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
      return bytes.buffer;
    }

    for (const [path, digest] of artifacts) {
      const url = `https://huggingface.co${modelPrefix}${path}`;
      const body = new TextEncoder().encode(path).buffer;
      digestByBody.set(new TextDecoder().decode(body), digest);
      entries.set(url, { body, bytes: path.length });
    }
    for (const [url, digest] of runtimeArtifacts) {
      const path = url.split('/').at(-1) ?? url;
      const body = new TextEncoder().encode(path).buffer;
      digestByBody.set(new TextDecoder().decode(body), digest);
      entries.set(url, { body, bytes: path.length });
    }
    const populateEntries = () => {
      for (const [path, digest] of artifacts) {
        const url = `https://huggingface.co${modelPrefix}${path}`;
        const body = new TextEncoder().encode(path).buffer;
        digestByBody.set(new TextDecoder().decode(body), digest);
        entries.set(url, { body, bytes: path.length });
      }
      for (const [url, digest] of runtimeArtifacts) {
        const path = url.split('/').at(-1) ?? url;
        const body = new TextEncoder().encode(path).buffer;
        digestByBody.set(new TextDecoder().decode(body), digest);
        entries.set(url, { body, bytes: path.length });
      }
    };
    if (initialCache === 'empty') entries.clear();

    const originalSubtle = window.crypto.subtle;
    const subtlePrototype = Object.getPrototypeOf(originalSubtle) as SubtleCrypto;
    const originalDigest = originalSubtle.digest.bind(originalSubtle);
    const digest = async (_algorithm: AlgorithmIdentifier, data: BufferSource) => {
      const body = new TextDecoder().decode(new Uint8Array(data as ArrayBuffer));
      const expected = digestByBody.get(body);
      if (!expected) return originalDigest(_algorithm, data);
      return hexBuffer(expected);
    };
    try {
      Object.defineProperty(subtlePrototype, 'digest', { configurable: true, writable: true, value: digest });
    } catch {
      // The browser fixture requires a writable SubtleCrypto digest method.
    }

    const cache = {
      keys: async () => [...entries.keys()].map((url) => ({ url })),
      match: async (request: { url: string }) => {
        const entry = entries.get(request.url);
        if (!entry) return undefined;
        return {
          headers: { get: (name: string) => name.toLowerCase() === 'content-length' ? String(entry.bytes) : null },
          arrayBuffer: async () => entry.body,
          clone() { return this; }
        };
      },
      delete: async (request: { url: string }) => entries.delete(request.url)
    };
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { open: async () => cache }
    });

    const track = {
      readyState: 'live',
      stop() {
        if (this.readyState === 'ended') return;
        this.readyState = 'ended';
        state.trackStops += 1;
      }
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (denyMicrophone) throw new DOMException('Microphone permission was denied.', 'NotAllowedError');
          return { getTracks: () => [track] };
        }
      }
    });
    if (storageFreeBytes !== undefined) {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: { estimate: async () => ({ quota: storageFreeBytes, usage: 0 }) }
      });
    }

    class FakeMediaRecorder {
      static isTypeSupported = () => true;
      state: 'inactive' | 'recording' = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        window.setTimeout(() => {
          this.ondataavailable?.({ data: new Blob(['voice']) });
          this.onstop?.();
        }, 0);
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });

    class FakeAudioContext {
      async decodeAudioData() {
        return {
          length: 2,
          numberOfChannels: 1,
          sampleRate: 16_000,
          getChannelData: () => new Float32Array([0.1, -0.1])
        };
      }
      async close() { return undefined; }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });

    if (failWebGpu || !('gpu' in navigator)) {
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: { requestAdapter: async () => ({}) } });
    }

    class FakeWorker {
      private readonly listeners = new Map<string, Set<(event: { data: unknown }) => void>>();
      private terminated = false;
      constructor() {
        for (const type of ['message', 'error']) this.listeners.set(type, new Set());
      }
      addEventListener(type: string, listener: (event: { data: unknown }) => void) {
        this.listeners.get(type)?.add(listener);
      }
      removeEventListener(type: string, listener: (event: { data: unknown }) => void) {
        this.listeners.get(type)?.delete(listener);
      }
      terminate() {
        this.terminated = true;
        state.workerTerminations += 1;
      }
      postMessage(message: { type: string; operation?: string; requestId?: string; payload?: { device?: string } }) {
        if (message.type === 'cancel') return;
        if (message.type !== 'execute' || !message.operation || !message.requestId) return;
        if (message.operation === 'prepare') {
          const device = message.payload?.device ?? 'wasm';
          state.prepareDevices.push(device);
          state.prepareLocalFilesOnly.push(message.payload?.localFilesOnly === true);
          this.emit({ version: 1, type: 'state', state: 'loading' });
          window.setTimeout(() => {
            if (this.terminated) return;
            if (failWebGpu && device === 'webgpu') {
              this.emit({ version: 1, type: 'result', requestId: message.requestId, operation: 'prepare', result: { ok: false, error: { code: 'unsupported-device', message: 'WebGPU is unavailable in the browser fixture.' } } });
              this.emit({ version: 1, type: 'state', state: 'uninstalled' });
              return;
            }
            populateEntries();
            this.emit({ version: 1, type: 'result', requestId: message.requestId, operation: 'prepare', result: { ok: true, value: undefined } });
            this.emit({ version: 1, type: 'state', state: 'ready' });
          }, 0);
          return;
        }
        if (message.operation === 'transcribe') {
          this.emit({ version: 1, type: 'state', state: 'transcribing' });
          window.setTimeout(() => {
            if (this.terminated) return;
            this.emit({ version: 1, type: 'result', requestId: message.requestId, operation: 'transcribe', result: { ok: true, value: { text: voiceTranscript ?? '1 across abab' } } });
            this.emit({ version: 1, type: 'state', state: 'ready' });
          }, transcriptionDelayMs ?? 0);
          return;
        }
        this.emit({ version: 1, type: 'result', requestId: message.requestId, operation: 'unload', result: { ok: true, value: undefined } });
        this.emit({ version: 1, type: 'state', state: 'uninstalled' });
      }
      private emit(data: unknown) {
        if (this.terminated) return;
        for (const listener of this.listeners.get('message') ?? []) listener({ data });
      }
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: FakeWorker });
  }, options);
}

async function readVoiceState(page: Page): Promise<VoiceTestState> {
  return page.evaluate(() => (window as Window & { __voiceTestState: VoiceTestState }).__voiceTestState);
}

async function openSpeechSetup(page: Page, cacheStatus = 'cached') {
  await page.locator('button[title="Model setup"]').click();
  await expect(page.getByRole('heading', { name: 'Model setup' })).toBeVisible();
  await expect(page.locator('.setup-detail').filter({ hasText: `Browser cache: ${cacheStatus}` })).toBeVisible();
}

test.describe('voice mode browser contract', () => {
  test('loads speech from cache, previews before confirmation, and deletes only downloaded artifacts', async ({ page }) => {
    await installVoiceFakes(page);
    const externalRequests: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('http://localhost:5173')) externalRequests.push(request.url());
    });
    await openSolver(page);
    await openSpeechSetup(page);

    await page.getByText('Voice mode off', { exact: true }).click();
    await page.getByRole('button', { name: 'Load speech from cache' }).click();
    await expect(page.locator('.setup-status').filter({ hasText: 'Speech model ready' })).toBeVisible();
    await page.getByRole('button', { name: 'Close model setup' }).click();

    await page.reload();
    await page.waitForSelector('#crossword-container input');
    await openSpeechSetup(page);
    await page.context().setOffline(true);
    await page.getByRole('button', { name: 'Load speech from cache' }).click();
    await expect(page.locator('.setup-status').filter({ hasText: 'Speech model ready' })).toBeVisible();
    expect((await readVoiceState(page)).prepareLocalFilesOnly).toEqual([true]);
    await page.getByRole('button', { name: 'Close model setup' }).click();

    const voiceButton = page.locator('#voice-solve-button');
    await voiceButton.click();
    await expect(page.locator('.voice-status')).toContainText('Listening');
    await voiceButton.click();
    await expect(page.locator('.voice-candidate-dialog')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'ABAB' })).toBeVisible();
    await expect(page.locator('.voice-preview-letter')).toHaveCount(4);
    await expect(gridCell(page, 'real-cell-0-0')).toHaveValue('');
    await expect(page.locator('.voice-preview-state')).toHaveCount(4);

    await voiceButton.click();
    await expect(gridCell(page, 'real-cell-0-0')).toHaveValue('A');
    await expect(gridCell(page, 'real-cell-0-1')).toHaveValue('B');
    await expect(gridCell(page, 'real-cell-0-2')).toHaveValue('A');
    await expect(gridCell(page, 'real-cell-0-3')).toHaveValue('B');
    await expect(page.locator('.voice-candidate-dialog')).toHaveCount(0);

    const stateAfterFill = await readVoiceState(page);
    expect(stateAfterFill.trackStops).toBe(1);
    expect(externalRequests).toEqual([]);

    await openSpeechSetup(page);
    await page.getByRole('button', { name: 'Unload speech from memory' }).click();
    await expect(page.locator('.setup-status').filter({ hasText: 'Speech model uninstalled' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete downloaded speech model' }).click();
    await expect(page.locator('.setup-detail').filter({ hasText: 'Browser cache: not-cached' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download speech model' })).toBeVisible();
    await page.context().setOffline(false);
  });

  test('falls back to WASM when the preferred WebGPU preparation is unsupported', async ({ page }) => {
    await installVoiceFakes(page, { failWebGpu: true });
    await openSolver(page);
    await openSpeechSetup(page);

    await page.getByRole('button', { name: 'Load speech from cache' }).click();
    await expect(page.locator('.data-notice')).toContainText('WebGPU was unavailable; using WASM.');
    await expect(page.locator('.setup-detail').filter({ hasText: 'using WASM' })).toBeVisible();

    const state = await readVoiceState(page);
    expect(state.prepareDevices).toEqual(['webgpu', 'wasm']);
  });

  test('chooses the smaller WASM backend when only its storage budget fits', async ({ page }) => {
    await installVoiceFakes(page, { initialCache: 'empty', storageFreeBytes: 70_000_000 });
    await openSolver(page);
    await openSpeechSetup(page, 'not-cached');

    await page.getByRole('button', { name: 'Download speech model' }).click();
    await expect(page.locator('.data-notice')).toContainText('WebGPU was unavailable; using WASM.');
    await expect(page.locator('.setup-detail').filter({ hasText: 'Browser cache: cached' })).toBeVisible();
    await expect(page.locator('.setup-detail').filter({ hasText: 'using WASM' })).toBeVisible();

    const state = await readVoiceState(page);
    expect(state.prepareDevices).toEqual(['wasm']);
    expect(state.prepareLocalFilesOnly).toEqual([false]);
  });

  test('cancels a pending chooser on Escape and restores focus without filling', async ({ page }) => {
    await installVoiceFakes(page);
    await openSolver(page);
    await openSpeechSetup(page);
    await page.getByText('Voice mode off', { exact: true }).click();
    await page.getByRole('button', { name: 'Load speech from cache' }).click();
    await expect(page.locator('.setup-status').filter({ hasText: 'Speech model ready' })).toBeVisible();
    await page.getByRole('button', { name: 'Close model setup' }).click();

    const voiceButton = page.locator('#voice-solve-button');
    await voiceButton.click();
    await voiceButton.click();
    await expect(page.locator('.voice-candidate-dialog')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'ABAB' })).toBeFocused();
    const a11y = await new AxeBuilder({ page }).include('.voice-candidate-dialog').analyze();
    expect(a11y.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
    await page.keyboard.press('Escape');

    await expect(page.locator('.voice-candidate-dialog')).toHaveCount(0);
    await expect(voiceButton).toBeFocused();
    await expect(gridCell(page, 'real-cell-0-0')).toHaveValue('');
    expect((await readVoiceState(page)).trackStops).toBe(1);
  });

  test('cancels during transcription and replaces the speech worker', async ({ page }) => {
    await installVoiceFakes(page, { transcriptionDelayMs: 1_000 });
    await openSolver(page);
    await openSpeechSetup(page);
    await page.getByText('Voice mode off', { exact: true }).click();
    await page.getByRole('button', { name: 'Load speech from cache' }).click();
    await expect(page.locator('.setup-status').filter({ hasText: 'Speech model ready' })).toBeVisible();
    await page.getByRole('button', { name: 'Close model setup' }).click();

    const voiceButton = page.locator('#voice-solve-button');
    await voiceButton.click();
    await voiceButton.click();
    await expect(page.locator('.voice-status')).toContainText('Transcribing locally.');
    await voiceButton.click();

    await expect(page.locator('.voice-status')).toContainText('Voice input canceled.');
    await expect(page.locator('.voice-candidate-dialog')).toHaveCount(0);
    const state = await readVoiceState(page);
    expect(state.trackStops).toBe(1);
    expect(state.workerTerminations).toBeGreaterThanOrEqual(1);

    await openSpeechSetup(page);
    await expect(page.getByRole('button', { name: 'Load speech from cache' })).toBeVisible();
    await page.getByRole('button', { name: 'Load speech from cache' }).click();
    await expect(page.locator('.setup-status').filter({ hasText: 'Speech model ready' })).toBeVisible();
  });

  test('keeps typed solving usable when microphone permission is denied', async ({ page }) => {
    await installVoiceFakes(page, { denyMicrophone: true });
    await openSolver(page);
    await openSpeechSetup(page);
    await page.getByText('Voice mode off', { exact: true }).click();
    await page.getByRole('button', { name: 'Load speech from cache' }).click();
    await expect(page.locator('.setup-status').filter({ hasText: 'Speech model ready' })).toBeVisible();
    await page.getByRole('button', { name: 'Close model setup' }).click();

    await page.locator('#voice-solve-button').click();
    await expect(page.locator('.voice-status')).toContainText('Microphone permission was denied.');

    const firstCell = gridCell(page, 'real-cell-0-0');
    await firstCell.click();
    await page.keyboard.type('A');
    await expect(firstCell).toHaveValue('A');
  });
});
