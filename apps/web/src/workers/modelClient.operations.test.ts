import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelWorkerRequest, ModelWorkerResponse } from '@crossword/model-runtime';
import { createModelWorkerClient, ModelClientError, type ModelOperationEvent } from './modelClient';

class FakeWorker {
  readonly posted: ModelWorkerRequest[] = [];
  private readonly messageListeners = new Set<(event: MessageEvent<unknown>) => void>();
  private readonly errorListeners = new Set<() => void>();
  terminated = false;

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') this.messageListeners.add(listener as (event: MessageEvent<unknown>) => void);
    if (type === 'error') this.errorListeners.add(listener as () => void);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') this.messageListeners.delete(listener as (event: MessageEvent<unknown>) => void);
    if (type === 'error') this.errorListeners.delete(listener as () => void);
  }

  postMessage(message: ModelWorkerRequest): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: ModelWorkerResponse | unknown): void {
    const event = { data: message } as MessageEvent<unknown>;
    for (const listener of this.messageListeners) listener(event);
  }

  emitError(): void {
    for (const listener of this.errorListeners) listener();
  }
}

function executeRequest(worker: FakeWorker, index = 0): Extract<ModelWorkerRequest, { type: 'execute' }> {
  const request = worker.posted[index];
  if (!request || request.type !== 'execute') throw new Error('Expected execute request');
  return request;
}

describe('model worker client operation identity (ADR 0004 §3)', () => {
  it('emits start, request-scoped progress, and exactly one terminal event', async () => {
    const worker = new FakeWorker();
    const client = createModelWorkerClient(worker as unknown as Worker);
    const events: ModelOperationEvent[] = [];
    client.subscribeOperations((event) => events.push(event));

    const promise = client.install();
    const request = executeRequest(worker);
    worker.emit({ version: 1, type: 'progress', requestId: request.requestId, progress: { phase: 'downloading', progress: 0.5, text: 'Halfway' } });
    worker.emit({ version: 1, type: 'state', state: 'loaded' });
    worker.emit({ version: 1, type: 'result', requestId: request.requestId, operation: 'install', result: { ok: true, value: undefined } });
    await promise;

    const kinds = events.map((event) => event.status);
    expect(kinds).toEqual(['running', 'running', 'succeeded']);
    expect(events[0]).toMatchObject({ requestId: request.requestId, operation: 'install' });
    expect(events[1]).toMatchObject({ requestId: request.requestId, operation: 'install', progress: { phase: 'downloading' } });
    client.dispose();
  });

  it('tags cancelled and failed terminals so the UI can distinguish them', async () => {
    const worker = new FakeWorker();
    const client = createModelWorkerClient(worker as unknown as Worker);
    const events: ModelOperationEvent[] = [];
    client.subscribeOperations((event) => events.push(event));

    const cancelled = client.unload();
    const cancelRequest = executeRequest(worker);
    worker.emit({ version: 1, type: 'result', requestId: cancelRequest.requestId, operation: 'unload', result: { ok: false, error: { code: 'cancelled', message: 'Model request cancelled' } } });
    await cancelled;

    const failed = client.load();
    const failedRequest = executeRequest(worker, 1);
    worker.emit({ version: 1, type: 'result', requestId: failedRequest.requestId, operation: 'load', result: { ok: false, error: { code: 'runtime-error', message: 'engine lost' } } });
    await failed;

    expect(events.filter((event) => event.status === 'cancelled')).toHaveLength(1);
    expect(events.filter((event) => event.status === 'failed')).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ requestId: failedRequest.requestId, operation: 'load', error: { code: 'runtime-error' } });
    client.dispose();
  });

  it('keeps two owners isolated: a stale event from A never lands on B', async () => {
    const worker = new FakeWorker();
    const client = createModelWorkerClient(worker as unknown as Worker);
    const ownerBEvents: ModelOperationEvent[] = [];

    const ownerA = client.install();
    const requestA = executeRequest(worker);
    const ownerB = client.generateCandidates({ seed: 's', audienceSummary: 'b', requestedRoles: ['general'], excludedAnswers: [], maxSuggestions: 1 });
    const requestB = executeRequest(worker, 1);

    client.subscribeOperations((event) => {
      if (event.requestId === requestB.requestId) ownerBEvents.push(event);
    });

    // Reordered delivery: A's late progress arrives after B started.
    worker.emit({ version: 1, type: 'progress', requestId: requestA.requestId, progress: { phase: 'downloading', progress: 0.9, text: 'A stale' } });
    worker.emit({ version: 1, type: 'progress', requestId: requestB.requestId, progress: { phase: 'generating', progress: null, text: 'B live' } });
    worker.emit({ version: 1, type: 'progress', requestId: requestA.requestId, progress: { phase: 'downloading', progress: 1, text: 'A stale again' } });

    worker.emit({ version: 1, type: 'result', requestId: requestA.requestId, operation: 'install', result: { ok: true, value: undefined } });
    await ownerA;
    worker.emit({ version: 1, type: 'result', requestId: requestB.requestId, operation: 'generate-candidates', result: { ok: true, value: [{ surface: 'CAT', intendedSense: 'feline', associations: [], role: 'general', confidence: 0.5 }] } });
    await ownerB;

    // B subscribed late, so it observes exactly its own live progress and
    // terminal events: A's stale progress never lands on B's lease.
    expect(ownerBEvents.map((event) => event.status)).toEqual(['running', 'succeeded']);
    expect(ownerBEvents[0]).toMatchObject({ operation: 'generate-candidates', progress: { text: 'B live' } });
    expect(ownerBEvents.every((event) => event.requestId === requestB.requestId)).toBe(true);
    client.dispose();
  });

  it('drops progress for settled requestIds', async () => {
    const worker = new FakeWorker();
    const client = createModelWorkerClient(worker as unknown as Worker);
    const events: ModelOperationEvent[] = [];
    client.subscribeOperations((event) => events.push(event));

    const promise = client.load();
    const request = executeRequest(worker);
    worker.emit({ version: 1, type: 'result', requestId: request.requestId, operation: 'load', result: { ok: true, value: undefined } });
    await promise;
    worker.emit({ version: 1, type: 'progress', requestId: request.requestId, progress: { phase: 'loading-runtime', progress: 1, text: 'stale' } });

    expect(events.filter((event) => event.status === 'running')).toHaveLength(1);
    expect(events.at(-1)?.status).toBe('succeeded');
    client.dispose();
  });
});

describe('model worker client fatal worker loss (ADR 0004 §5, RTO-P1-3)', () => {
  it('fails pending operations with typed codes, notifies the owner, and refuses new commands', async () => {
    const worker = new FakeWorker();
    const onFatal = vi.fn();
    const client = createModelWorkerClient(worker as unknown as Worker, { onFatal });
    const events: ModelOperationEvent[] = [];
    client.subscribeOperations((event) => events.push(event));

    const pending = client.install();
    const request = executeRequest(worker);
    worker.emitError();

    await expect(pending).rejects.toMatchObject({ code: 'worker-fatal' });
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(events.filter((event) => event.status === 'failed').map((event) => event.requestId)).toEqual([request.requestId]);

    const postedBefore = worker.posted.length;
    await expect(client.load()).rejects.toBeInstanceOf(ModelClientError);
    expect(worker.posted.length).toBe(postedBefore);
    expect(client.isFatal()).toBe(true);
    client.dispose();
  });

  it('survives a garbage worker error without a requestId', () => {
    const worker = new FakeWorker();
    const client = createModelWorkerClient(worker as unknown as Worker);
    expect(() => worker.emit({ nonsense: true })).not.toThrow();
    client.dispose();
  });
});

describe('model worker client bounded cancellation (ADR 0004 §6, RTO-P1-5)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('forces worker replacement after the cooperative grace period', async () => {
    const worker = new FakeWorker();
    const onFatal = vi.fn();
    const client = createModelWorkerClient(worker as unknown as Worker, { onFatal });
    const events: ModelOperationEvent[] = [];
    client.subscribeOperations((event) => events.push(event));

    const controller = new AbortController();
    const pending = client.generateCandidates({ seed: 's', audienceSummary: 'b', requestedRoles: ['general'], excludedAnswers: [], maxSuggestions: 1 }, controller.signal);
    const request = executeRequest(worker);
    const otherPending = client.load();
    const otherRequest = executeRequest(worker, 1);

    const targetRejection = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    const otherRejection = expect(otherPending).rejects.toMatchObject({ code: 'worker-fatal' });

    controller.abort();
    expect(worker.posted.at(-1)).toEqual({ version: 1, type: 'cancel', requestId: request.requestId });

    await vi.advanceTimersByTimeAsync(8_000);

    await targetRejection;
    await otherRejection;
    expect(worker.terminated).toBe(true);
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(client.isFatal()).toBe(true);
    const targetTerminal = events.filter((event) => event.requestId === request.requestId).at(-1);
    expect(targetTerminal).toMatchObject({ status: 'cancelled', operation: 'generate-candidates' });
    client.dispose();
  });

  it('does not force replacement when the worker settles inside the grace period', async () => {
    const worker = new FakeWorker();
    const client = createModelWorkerClient(worker as unknown as Worker, { cancelGraceMs: 100 });
    const promise = client.unload();
    const request = executeRequest(worker);

    const cancelled = Promise.resolve(promise);
    client.cancel(request.requestId, { graceMs: 100 });
    worker.emit({ version: 1, type: 'result', requestId: request.requestId, operation: 'unload', result: { ok: false, error: { code: 'cancelled', message: 'Model request cancelled' } } });
    await cancelled;
    await vi.advanceTimersByTimeAsync(200);

    expect(worker.terminated).toBe(false);
    expect(client.isFatal()).toBe(false);
    client.dispose();
  });
});