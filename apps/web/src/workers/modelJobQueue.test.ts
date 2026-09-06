import { describe, expect, it, vi } from 'vitest';
import type { ModelWorkerResponse } from '@crossword/model-runtime';
import { createModelJobQueue } from './modelJobQueue';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

type Runner = Parameters<typeof createModelJobQueue>[1];
type Sink = (message: ModelWorkerResponse) => void;

function makeQueue(runner: Runner, state: () => 'uninstalled' | 'loaded' = () => 'loaded') {
  const posted: ModelWorkerResponse[] = [];
  const sink: Sink = (message) => posted.push(message);
  const queue = createModelJobQueue(sink, runner, state);
  return { queue, posted };
}

const job = (requestId: string, operation: 'load' | 'generate-candidates' = 'load') => ({
  requestId,
  operation,
  payload: undefined
});

describe('model worker single-command arbiter (ADR 0004 §4)', () => {
  it('runs queued jobs strictly one at a time in arrival order', async () => {
    const gates = [deferred<void>(), deferred<void>()];
    let started = 0;
    const startedOrder: string[] = [];
    const runner: Runner = (job) => {
      startedOrder.push(job.requestId);
      started += 1;
      return gates[started - 1]!.promise.then(() => ({ ok: true, value: undefined }));
    };
    const { queue, posted } = makeQueue(runner);

    queue.enqueue(job('first'));
    queue.enqueue(job('second'));
    expect(started).toBe(1);
    expect(startedOrder).toEqual(['first']);

    gates[0]!.resolve(undefined);
    await vi.waitFor(() => expect(started).toBe(2));
    expect(startedOrder).toEqual(['first', 'second']);

    gates[1]!.resolve(undefined);
    await vi.waitFor(() => expect(queue.isIdle()).toBe(true));
    expect(posted.filter((message) => message.type === 'result')).toHaveLength(2);
  });

  it('settles a queued cancellation immediately without running it', async () => {
    const gate = deferred<void>();
    const runner: Runner = vi.fn((job) => gate.promise.then(() => ({ ok: true as const, value: undefined })));
    const { queue, posted } = makeQueue(runner);

    queue.enqueue(job('running'));
    queue.enqueue(job('queued', 'generate-candidates'));
    queue.cancel('queued');

    const cancelled = posted.find((message) => message.type === 'result' && message.requestId === 'queued');
    expect(cancelled).toMatchObject({
      type: 'result',
      operation: 'generate-candidates',
      result: { ok: false, error: { code: 'cancelled' } }
    });
    expect(runner).toHaveBeenCalledTimes(1);

    gate.resolve(undefined);
    await vi.waitFor(() => expect(queue.isIdle()).toBe(true));
  });

  it('aborts the signal of a running job on cancel and posts state after it settles', async () => {
    const gate = deferred<void>();
    let aborted: AbortSignal | undefined;
    const runner: Runner = (job) => {
      aborted = job.signal;
      return gate.promise.then(() => ({ ok: false, error: { code: 'cancelled' as const, message: 'Model request cancelled' } }));
    };
    const { queue, posted } = makeQueue(runner);

    queue.enqueue(job('gen'));
    queue.cancel('gen');
    expect(aborted?.aborted).toBe(true);

    gate.resolve(undefined);
    await vi.waitFor(() => expect(queue.isIdle()).toBe(true));
    const result = posted.find((message) => message.type === 'result' && message.requestId === 'gen');
    expect(result).toMatchObject({ type: 'result', result: { ok: false, error: { code: 'cancelled' } } });
    expect(posted.some((message) => message.type === 'state' && message.state === 'loaded')).toBe(true);
  });

  it('rejects duplicate request identifiers without disturbing the running job', () => {
    const gate = deferred<void>();
    const runner: Runner = () => gate.promise.then(() => ({ ok: true, value: undefined }));
    const { queue, posted } = makeQueue(runner);

    queue.enqueue(job('dup'));
    queue.enqueue(job('dup'));

    expect(posted.at(-1)).toMatchObject({ type: 'protocol-error', message: expect.stringContaining('already running') });
    gate.resolve(undefined);
  });

  it('reports a protocol error when the runner throws and keeps serving the queue', async () => {
    const gates = [deferred<void>(), deferred<void>()];
    let started = 0;
    const runner: Runner = (job) => {
      started += 1;
      if (started === 1) return gates[0]!.promise.then(() => { throw new Error('engine exploded'); });
      return gates[1]!.promise.then(() => ({ ok: true, value: undefined }));
    };
    const { queue, posted } = makeQueue(runner);

    queue.enqueue(job('bad'));
    queue.enqueue(job('next'));
    gates[0]!.resolve(undefined);

    await vi.waitFor(() => expect(started).toBe(2));
    const error = posted.find((message) => message.type === 'protocol-error' && message.requestId === 'bad');
    expect(error).toMatchObject({ type: 'protocol-error', message: 'engine exploded' });
    gates[1]!.resolve(undefined);
    await vi.waitFor(() => expect(queue.isIdle()).toBe(true));
  });

  it('posts the broker state after every terminal result', async () => {
    const gate = deferred<void>();
    const states = ['loaded'] as const;
    const runner: Runner = () => gate.promise.then(() => ({ ok: true, value: undefined }));
    const { queue, posted } = makeQueue(runner, () => states[0]!);

    queue.enqueue(job('one'));
    gate.resolve(undefined);
    await vi.waitFor(() => expect(queue.isIdle()).toBe(true));

    expect(posted.filter((message) => message.type === 'state')).toHaveLength(1);
  });
});