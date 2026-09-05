import { describe, expect, it } from 'vitest';
import type { SpeechWorkerRequest, SpeechWorkerResponse } from './speechClient';
import { createSpeechWorkerClient, parseSpeechWorkerRequest } from './speechClient';

class FakeWorker {
  readonly posted: SpeechWorkerRequest[] = [];
  readonly transfers: Transferable[][] = [];
  terminated = false;
  private readonly messageListeners = new Set<(event: MessageEvent<unknown>) => void>();
  private readonly errorListeners = new Set<() => void>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') this.messageListeners.add(listener as (event: MessageEvent<unknown>) => void);
    if (type === 'error') this.errorListeners.add(listener as () => void);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') this.messageListeners.delete(listener as (event: MessageEvent<unknown>) => void);
    if (type === 'error') this.errorListeners.delete(listener as () => void);
  }

  postMessage(message: SpeechWorkerRequest, transfer?: Transferable[]): void {
    this.posted.push(message);
    this.transfers.push(transfer ?? []);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: SpeechWorkerResponse): void {
    const event = { data: message } as MessageEvent<unknown>;
    for (const listener of this.messageListeners) listener(event);
  }

  emitError(): void {
    for (const listener of this.errorListeners) listener();
  }
}

describe('speech worker protocol and client', () => {
  it('accepts only bounded, operation-specific requests', () => {
    const samples = new Float32Array([0.1, -0.1]);
    expect(parseSpeechWorkerRequest({
      version: 1,
      type: 'execute',
      requestId: 'prepare-1',
      operation: 'prepare',
      payload: { device: 'wasm', localFilesOnly: true }
    })).toMatchObject({ operation: 'prepare', payload: { device: 'wasm', localFilesOnly: true } });
    expect(parseSpeechWorkerRequest({
      version: 1,
      type: 'execute',
      requestId: 'transcribe-1',
      operation: 'transcribe',
      payload: { samples }
    })).toMatchObject({ operation: 'transcribe', payload: { samples } });
    expect(parseSpeechWorkerRequest({ version: 1, type: 'execute', requestId: 'unload-1', operation: 'unload' })).toMatchObject({ operation: 'unload' });
    expect(parseSpeechWorkerRequest({ version: 1, type: 'execute', requestId: 'bad-1', operation: 'prepare', payload: { device: 'cuda' } })).toBeUndefined();
    expect(parseSpeechWorkerRequest({ version: 1, type: 'execute', requestId: 'bad-2', operation: 'transcribe', payload: { samples: [0.1] } })).toBeUndefined();
    expect(parseSpeechWorkerRequest({ version: 1, type: 'execute', requestId: 'bad-3', operation: 'unload', payload: {} })).toBeUndefined();
  });

  it('transfers audio and resolves typed worker results', async () => {
    const worker = new FakeWorker();
    const client = createSpeechWorkerClient(worker as unknown as Worker);
    const samples = new Float32Array([0.1, -0.1]);
    const promise = client.transcribe(samples);
    const request = worker.posted[0];
    if (!request || request.type !== 'execute') throw new Error('Expected transcribe request');
    expect(request.operation).toBe('transcribe');
    expect(worker.transfers[0]).toEqual([samples.buffer]);
    worker.emit({ version: 1, type: 'state', state: 'ready' });
    worker.emit({ version: 1, type: 'result', requestId: request.requestId, operation: 'transcribe', result: { ok: true, value: { text: '1 across care' } } });
    await expect(promise).resolves.toEqual({ ok: true, value: { text: '1 across care' } });
    expect(client.state()).toBe('ready');
    client.dispose();
  });

  it('rejects a result whose operation does not match the pending job', async () => {
    const worker = new FakeWorker();
    const client = createSpeechWorkerClient(worker as unknown as Worker);
    const promise = client.transcribe(new Float32Array([0.1]));
    const request = worker.posted[0];
    if (!request || request.type !== 'execute') throw new Error('Expected transcribe request');

    worker.emit({
      version: 1,
      type: 'result',
      requestId: request.requestId,
      operation: 'prepare',
      result: { ok: true, value: undefined }
    });
    await expect(promise).rejects.toThrow('operation mismatch');
    client.dispose();
  });

  it('terminates and recreates the worker when speech work is canceled', async () => {
    const firstWorker = new FakeWorker();
    const replacementWorker = new FakeWorker();
    const controller = new AbortController();
    const client = createSpeechWorkerClient(firstWorker as unknown as Worker, () => replacementWorker as unknown as Worker);
    const promise = client.transcribe(new Float32Array([0.1]), controller.signal);

    controller.abort();

    await expect(promise).resolves.toMatchObject({ ok: false, error: { code: 'cancelled' } });
    expect(firstWorker.terminated).toBe(true);
    expect(client.state()).toBe('uninstalled');
    client.dispose();
  });

  it('settles concurrent work and permits retry after cancellation replaces the worker', async () => {
    const firstWorker = new FakeWorker();
    const replacementWorker = new FakeWorker();
    const controller = new AbortController();
    const client = createSpeechWorkerClient(firstWorker as unknown as Worker, () => replacementWorker as unknown as Worker);
    const prepare = client.prepare('wasm');
    const transcribe = client.transcribe(new Float32Array([0.1]), controller.signal);

    controller.abort();

    await expect(transcribe).resolves.toMatchObject({ ok: false, error: { code: 'cancelled' } });
    await expect(prepare).rejects.toThrow('Speech worker restarted');
    expect(client.state()).toBe('uninstalled');

    const retry = client.prepare('wasm');
    const request = replacementWorker.posted[0];
    if (!request || request.type !== 'execute') throw new Error('Expected retry prepare request');
    replacementWorker.emit({ version: 1, type: 'state', state: 'ready' });
    replacementWorker.emit({ version: 1, type: 'result', requestId: request.requestId, operation: 'prepare', result: { ok: true, value: undefined } });
    await expect(retry).resolves.toEqual({ ok: true, value: undefined });
    expect(client.state()).toBe('ready');
    client.dispose();
  });

  it('recreates the worker after an unexpected stop and permits retry', async () => {
    const firstWorker = new FakeWorker();
    const replacementWorker = new FakeWorker();
    const client = createSpeechWorkerClient(firstWorker as unknown as Worker, () => replacementWorker as unknown as Worker);
    const failed = client.prepare('wasm');

    firstWorker.emitError();

    await expect(failed).rejects.toThrow('stopped unexpectedly');
    expect(firstWorker.terminated).toBe(true);

    const retry = client.prepare('wasm');
    const request = replacementWorker.posted[0];
    if (!request || request.type !== 'execute') throw new Error('Expected retry prepare request');
    replacementWorker.emit({ version: 1, type: 'state', state: 'ready' });
    replacementWorker.emit({ version: 1, type: 'result', requestId: request.requestId, operation: 'prepare', result: { ok: true, value: undefined } });
    await expect(retry).resolves.toEqual({ ok: true, value: undefined });
    client.dispose();
  });
});