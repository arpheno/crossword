import { describe, expect, it } from 'vitest';
import type { ModelWorkerRequest, ModelWorkerResponse } from '@crossword/model-runtime';
import { createModelWorkerClient } from './modelClient';

class FakeWorker {
  readonly posted: ModelWorkerRequest[] = [];
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

  postMessage(message: ModelWorkerRequest): void { this.posted.push(message); }
  terminate(): void { /* fixture */ }

  emit(message: ModelWorkerResponse): void {
    const event = { data: message } as MessageEvent<unknown>;
    this.messageListeners.forEach((listener) => listener(event));
  }
}

describe('model worker telemetry routing', () => {
  it('delivers progress events without settling the operation early', async () => {
    const worker = new FakeWorker();
    const client = createModelWorkerClient(worker as unknown as Worker);
    const progress: unknown[] = [];
    client.subscribeProgress((event) => progress.push(event));
    const promise = client.install();
    const request = worker.posted[0];
    if (!request || request.type !== 'execute') throw new Error('Expected execute request');

    worker.emit({ version: 1, type: 'progress', requestId: request.requestId, progress: { phase: 'downloading', progress: 0.5, text: 'Halfway' } });
    let settled = false;
    void promise.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(progress).toEqual([{ phase: 'downloading', progress: 0.5, text: 'Halfway' }]);

    worker.emit({ version: 1, type: 'result', requestId: request.requestId, operation: 'install', result: { ok: true, value: undefined } });
    await expect(promise).resolves.toEqual({ ok: true, value: undefined });
    client.dispose();
  });
});
